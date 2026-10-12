import { randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { MongoClient } from "mongodb";

import { CLIENT_DEFAULTS, CLIENT_FIELDS, STEP_FIELDS, TRIMMED_FIELDS, validateClient } from "./lib/clients.js";
import { OWNERS_TAB, SHEET_FIELDS, SheetLink, newClientFromSheet, rowsMissingFormula, sheetConfigFromEnv } from "./lib/sheets.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "mapping_desk";
const PORT = Number(process.env.PORT) || 3000;

if (!MONGODB_URI || MONGODB_URI.includes("<")) {
  console.error("Missing MONGODB_URI. Locally: copy .env.example to .env and paste your MongoDB Atlas connection string. On Render: add MONGODB_URI under the service's Environment settings.");
  process.exit(1);
}

let sheet = null;
try {
  const config = sheetConfigFromEnv(process.env);
  if (config) sheet = new SheetLink(config);
} catch (error) {
  console.error(`Google Sheet link isn't set up correctly: ${error.message}`);
  process.exit(1);
}
const SHEET_SYNC_MS = 30_000;
// A sync never removes more clients than this at once, in case rows were deleted by mistake.
const MAX_SHEET_REMOVALS = 5;

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Keep only known client fields so request bodies can't write arbitrary keys. */
function pickClientFields(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Send the client as a JSON object.");
  const out = {};
  for (const key of CLIENT_FIELDS) {
    if (!(key in body)) continue;
    out[key] = TRIMMED_FIELDS.includes(key) && typeof body[key] === "string" ? body[key].trim() : body[key];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const mongo = new MongoClient(MONGODB_URI);
await mongo.connect();
const db = mongo.db(MONGODB_DB);
const clientsCol = db.collection("clients");
const activityCol = db.collection("activity");
const ownersCol = db.collection("owners");
const settingsCol = db.collection("settings");
const DEFAULT_SETTINGS = { slaDays: 15 };
// Owner names are unique ignoring case ("Adithya" and "adithya" are the same owner).
const CASE_INSENSITIVE = { locale: "en", strength: 2 };
await clientsCol.createIndex({ customerId: 1 }, { unique: true });
await clientsCol.createIndex({ updatedAt: -1 });
await activityCol.createIndex({ createdAt: -1 });
await activityCol.createIndex({ clientId: 1, createdAt: -1 });
await ownersCol.createIndex({ name: 1 }, { unique: true, collation: CASE_INSENSITIVE });
await seedOwners();
console.log(`Connected to MongoDB database "${MONGODB_DB}".`);

/** First run only: build the owners list from the POC names already on clients. */
async function seedOwners() {
  if (await ownersCol.estimatedDocumentCount()) return;
  const names = (await clientsCol.distinct("poc")).map((name) => name.trim()).filter(Boolean);
  const now = new Date().toISOString();
  for (const name of names) {
    await ownersCol.updateOne({ name }, { $setOnInsert: { _id: randomUUID(), name, createdAt: now } }, { upsert: true, collation: CASE_INSENSITIVE });
  }
  if (names.length) console.log(`Created ${names.length} owners from existing client POCs.`);
}

/** Returns the owner's stored spelling, or throws if the name isn't in the owners list. */
async function resolveOwner(name) {
  if (!name) return "";
  const owner = await ownersCol.findOne({ name }, { collation: CASE_INSENSITIVE });
  if (!owner) throw new HttpError(400, `"${name}" isn't in the owners list. Add them under Owners first.`);
  return owner.name;
}

/** Documents use a UUID string as _id; the front end calls it `id`. */
function toApi({ _id, ...rest }) {
  return { id: _id, ...rest };
}

/** Records a change. `client` is null for tracker-wide changes such as settings. */
async function logActivity(client, message, clientId, createdAt, kind = "edit") {
  await activityCol.insertOne({
    _id: randomUUID(),
    clientId,
    customerId: client?.customerId ?? null,
    clientName: client?.name ?? "",
    message,
    kind,
    createdAt,
  });
}

const FIELD_LABELS = {
  customerId: "Customer ID", name: "Name", siteCount: "Sites", naCount: "N/A count", country: "Country",
  poc: "POC", lead1: "Lead 1", lead2: "Lead 2", trackingGroup: "Tracking",
  flag10At: "Flag 10 review", priceNaAt: "Price N/A review", compReviewAt: "Comp review", finalQcAt: "Final QC",
};
const TRACKING_LABELS = { cycle: "In cycle", await: "Awaiting request", nomap: "No mapping needed" };
const shortDate = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${m}/${d}`; };

/** Human-readable summary of what changed, e.g. "Final QC → 10/8; POC → Rayan". */
function describeChanges(before, after) {
  const parts = [];
  for (const key of [...STEP_FIELDS, ...Object.keys(FIELD_LABELS).filter((k) => !STEP_FIELDS.includes(k))]) {
    if (!(key in after) || before[key] === after[key]) continue;
    const value = after[key];
    let shown;
    if (STEP_FIELDS.includes(key)) shown = value ? `→ ${shortDate(value)}` : "cleared";
    else if (key === "trackingGroup") shown = `→ ${TRACKING_LABELS[value]}`;
    else shown = value === "" || value == null ? "→ none" : `→ ${value}`;
    parts.push(`${FIELD_LABELS[key]} ${shown}`);
  }
  if ("comments" in after && before.comments !== after.comments) parts.push("Comment updated");
  return parts.join("; ");
}

async function getSettings() {
  const doc = await settingsCol.findOne({ _id: "app" });
  return { ...DEFAULT_SETTINGS, ...(doc ? { slaDays: doc.slaDays } : {}) };
}

function rethrowDuplicate(error) {
  if (error?.code === 11000) throw new HttpError(409, "That customer ID is already in the tracker.");
  throw error;
}

// ---------------------------------------------------------------------------
// Google Sheet link (only when GOOGLE_SHEET_ID is set)
// ---------------------------------------------------------------------------

// Edits and sheet syncs run one at a time, so a sync never reads the sheet halfway through an edit.
let writeQueue = Promise.resolve();
function exclusive(task) {
  const run = writeQueue.then(task);
  writeQueue = run.catch(() => {});
  return run;
}

let sheetStatus = { lastSyncAt: null, error: null, problems: [] };
let lastSyncStarted = 0;
let pendingSync = null;

/** The sheet is the main copy, so dashboard edits go to it first. If that fails, nothing is saved. */
async function pushToSheet(changes) {
  if (!sheet) return;
  try {
    await sheet.write(changes);
  } catch (error) {
    throw new HttpError(502, `Not saved: couldn't update the Google Sheet. ${error.message}`);
  }
}

const sameValue = (a, b) => (typeof a === "string" && typeof b === "string" ? a.trim() === b.trim() : (a ?? null) === (b ?? null));

/**
 * Makes MongoDB match the sheet: owners from the Owners tab, then clients from
 * the clients tab. Any sheet fixes this implies (new names in the Owners tab,
 * POCs cleared for removed owners) are written to the sheet first.
 * Returns how many records changed.
 */
async function syncFromSheet() {
  const parsed = await sheet.read();
  const now = new Date().toISOString();
  const problems = [...parsed.problems, ...(parsed.owners?.problems ?? [])];
  // Every client row gets the Mapping Status formula, including rows typed straight into the sheet.
  const sheetEdits = { updates: [], ownerAdds: [], formulaRows: rowsMissingFormula(parsed) };

  // --- Plan owners -----------------------------------------------------------
  const owners = await ownersCol.find().toArray();
  const known = new Map(owners.map((owner) => [owner.name.toLowerCase(), owner.name])); // owners after this sync
  let removedOwners = [];
  if (parsed.owners) {
    const gone = owners.filter((owner) => !parsed.owners.names.has(owner.name.toLowerCase()));
    if (gone.length > MAX_SHEET_REMOVALS) {
      problems.push({ tab: OWNERS_TAB, row: null, message: `${gone.length} owners are on the dashboard but not in the Owners tab. They weren't removed, because that's more than ${MAX_SHEET_REMOVALS} at once. Put the names back, or remove the owners on the dashboard.` });
    } else {
      removedOwners = gone;
      for (const owner of gone) known.delete(owner.name.toLowerCase());
    }
    for (const { name } of parsed.owners.names.values()) if (!known.has(name.toLowerCase())) known.set(name.toLowerCase(), name);
  } else {
    sheetEdits.ownerAdds.push(...known.values()); // first sync: create the Owners tab from the current owners
  }
  const removedKeys = new Set(removedOwners.map((owner) => owner.name.toLowerCase()));

  // --- Plan the overdue window (the number in the Mapping Status formula) ----
  // If any formula differs from the current window, someone edited it: adopt that number and make every formula match.
  const settings = await getSettings();
  let newSlaDays = null;
  const differing = parsed.statusFormulas.filter((cell) => cell.days !== settings.slaDays);
  if (differing.length) {
    const counts = new Map();
    for (const cell of differing) counts.set(cell.days, (counts.get(cell.days) ?? 0) + 1);
    const [days] = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (days >= 1 && days <= 365) {
      newSlaDays = days;
      sheetEdits.slaDays = days;
    } else {
      problems.push({ row: differing[0].row, message: `The Mapping Status formula uses ${days} days; the overdue window must be 1 to 365 days.` });
    }
  }

  // --- Plan clients ----------------------------------------------------------
  const fromSheet = new Map();
  for (const [customerId, { client }] of parsed.rows) {
    let poc = client.poc;
    if (poc && removedKeys.has(poc.toLowerCase())) {
      poc = ""; // owner removed from the Owners tab: unassign, in the sheet too
      sheetEdits.updates.push({ customerId, client: { ...client, poc } });
    } else if (poc && !known.has(poc.toLowerCase())) {
      known.set(poc.toLowerCase(), poc); // new name typed as a POC: becomes an owner
      sheetEdits.ownerAdds.push(poc);
    }
    fromSheet.set(customerId, { ...client, poc: poc ? known.get(poc.toLowerCase()) : "" });
  }

  if (sheetEdits.updates.length || sheetEdits.ownerAdds.length || sheetEdits.formulaRows.length || newSlaDays) await sheet.write(sheetEdits, parsed);

  // --- Apply to MongoDB ------------------------------------------------------
  let changed = 0;
  if (newSlaDays) {
    await settingsCol.updateOne({ _id: "app" }, { $set: { slaDays: newSlaDays } }, { upsert: true });
    await logActivity(null, `Overdue window changed from ${settings.slaDays} to ${newSlaDays} days (from Google Sheet)`, null, now, "settings");
    changed += 1;
  }
  for (const owner of removedOwners) {
    await ownersCol.deleteOne({ _id: owner._id });
    await logActivity(null, `Owner ${owner.name} removed (from Google Sheet)`, null, now, "owner");
    changed += 1;
  }
  const existingOwners = new Set(owners.map((owner) => owner.name.toLowerCase()));
  for (const name of known.values()) {
    if (existingOwners.has(name.toLowerCase())) continue;
    await ownersCol.updateOne({ name }, { $setOnInsert: { _id: randomUUID(), name, createdAt: now } }, { upsert: true, collation: CASE_INSENSITIVE });
    await logActivity(null, `Owner ${name} added (from Google Sheet)`, null, now, "owner");
    changed += 1;
  }

  const existing = new Map((await clientsCol.find().toArray()).map((client) => [client.customerId, client]));
  for (const [customerId, client] of fromSheet) {
    const before = existing.get(customerId);
    if (!before) {
      const doc = { _id: randomUUID(), ...newClientFromSheet(client), createdAt: now, updatedAt: now };
      await clientsCol.insertOne(doc);
      await logActivity(doc, "Added from Google Sheet", doc._id, now, doc.finalQcAt ? "final-qc" : "edit");
      changed += 1;
      continue;
    }
    const changes = {};
    for (const field of SHEET_FIELDS) if (!sameValue(client[field], before[field])) changes[field] = client[field];
    if (!Object.keys(changes).length) continue;
    await clientsCol.updateOne({ _id: before._id }, { $set: { ...changes, updatedAt: now } });
    const kind = changes.finalQcAt ? "final-qc" : "edit";
    await logActivity({ ...before, ...changes }, `From Google Sheet: ${describeChanges(before, changes)}`, before._id, now, kind);
    changed += 1;
  }

  const missing = [...existing.values()].filter((client) => !parsed.rows.has(client.customerId) && !parsed.problemIds.has(client.customerId));
  if (missing.length > MAX_SHEET_REMOVALS) {
    problems.push({
      row: null,
      message: `${missing.length} clients are on the dashboard but not in the sheet. They weren't removed, because that's more than ${MAX_SHEET_REMOVALS} at once. Put the rows back, or remove the clients on the dashboard.`,
    });
  } else {
    for (const client of missing) {
      await clientsCol.deleteOne({ _id: client._id });
      await logActivity(client, `Removed CL-${client.customerId} ${client.name} (deleted from Google Sheet)`, null, now);
      changed += 1;
    }
  }

  sheetStatus = { lastSyncAt: now, error: null, problems };
  return changed;
}

/** Runs a sync unless one is already queued; failures are kept in sheetStatus, not thrown. */
function runSheetSync() {
  pendingSync ??= exclusive(async () => {
    lastSyncStarted = Date.now();
    try {
      const changed = await syncFromSheet();
      if (changed) console.log(`Google Sheet sync: ${changed} record(s) updated from the sheet.`);
    } catch (error) {
      sheetStatus = { ...sheetStatus, error: error.message };
      console.error(`Google Sheet sync failed: ${error.message}`);
    }
  }).finally(() => {
    pendingSync = null;
  });
  return pendingSync;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));

// Used by the host (Render) to check the app is up and can reach the database.
app.get("/api/health", async (_req, res) => {
  await db.command({ ping: 1 });
  res.json({ ok: true });
});

app.get("/api/clients", async (_req, res) => {
  if (sheet && Date.now() - lastSyncStarted > 10_000) await runSheetSync();
  const docs = await clientsCol.find().sort({ updatedAt: -1 }).limit(500).toArray();
  res.json({ clients: docs.map(toApi) });
});

// ?clientId=… returns one client's history; ?limit=… (max 200, default 30).
app.get("/api/activity", async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 30, 1), 200);
  const filter = typeof req.query.clientId === "string" ? { clientId: req.query.clientId } : {};
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [docs, total, cyclesClosedThisWeek] = await Promise.all([
    activityCol.find(filter).sort({ createdAt: -1 }).limit(limit).toArray(),
    activityCol.countDocuments(filter),
    activityCol.countDocuments({ kind: { $in: ["cycle-done", "final-qc"] }, createdAt: { $gte: weekAgo } }),
  ]);
  res.json({ activities: docs.map(toApi), total, cyclesClosedThisWeek });
});

app.get("/api/sheet", (_req, res) => {
  if (!sheet) return res.json({ enabled: false });
  res.json({ enabled: true, url: sheet.url, ...sheetStatus });
});

// Called by the Apps Script when someone edits the sheet, so the change shows without waiting for the next check.
app.post("/api/sheet/sync", (req, res) => {
  const given = Buffer.from(typeof req.body?.secret === "string" ? req.body.secret : "");
  const expected = Buffer.from(sheet?.secret ?? "");
  if (!sheet || given.length !== expected.length || !timingSafeEqual(given, expected)) throw new HttpError(403, "Not allowed.");
  runSheetSync();
  res.status(202).json({ ok: true });
});

app.get("/api/settings", async (_req, res) => {
  res.json({ settings: await getSettings() });
});

app.put("/api/settings", (req, res) => exclusive(async () => {
  const slaDays = req.body?.slaDays;
  if (!Number.isInteger(slaDays) || slaDays < 1 || slaDays > 365) throw new HttpError(400, "Overdue window must be a whole number of days from 1 to 365.");
  const before = await getSettings();
  if (before.slaDays !== slaDays) {
    await pushToSheet({ slaDays });
    await settingsCol.updateOne({ _id: "app" }, { $set: { slaDays } }, { upsert: true });
    await logActivity(null, `Overdue window changed from ${before.slaDays} to ${slaDays} days`, null, new Date().toISOString(), "settings");
  }
  res.json({ settings: await getSettings() });
}));

// Apply one action to many clients: mark the full cycle done, set Final QC, or reassign the owner.
app.post("/api/clients/bulk", (req, res) => exclusive(async () => {
  const { ids, action, date, poc } = req.body ?? {};
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every((id) => typeof id === "string")) {
    throw new HttpError(400, "Select between 1 and 500 clients.");
  }
  const needsDate = action === "cycle-done" || action === "final-qc";
  if (needsDate && validateClient({ ...CLIENT_DEFAULTS, customerId: 1, name: "x", finalQcAt: date })) {
    throw new HttpError(400, "Send the date as YYYY-MM-DD.");
  }

  let set;
  let message;
  let kind = "edit";
  if (action === "cycle-done") {
    set = { flag10At: date, priceNaAt: date, compReviewAt: date, finalQcAt: date, trackingGroup: "cycle" };
    message = `Full cycle done → ${shortDate(date)}`;
    kind = "cycle-done";
  } else if (action === "final-qc") {
    set = { finalQcAt: date };
    message = `Final QC → ${shortDate(date)}`;
    kind = "final-qc";
  } else if (action === "assign") {
    const owner = await resolveOwner(typeof poc === "string" ? poc.trim() : "");
    set = { poc: owner };
    message = `POC → ${owner || "none"}`;
  } else {
    throw new HttpError(400, "Unknown bulk action.");
  }

  const targets = await clientsCol.find({ _id: { $in: ids } }).toArray();
  await pushToSheet({ updates: targets.map((client) => ({ customerId: client.customerId, client: { ...client, ...set } })) });
  const now = new Date().toISOString();
  await clientsCol.updateMany({ _id: { $in: targets.map((client) => client._id) } }, { $set: { ...set, updatedAt: now } });
  for (const client of targets) await logActivity(client, message, client._id, now, kind);
  res.json({ updated: targets.length });
}));

app.post("/api/clients", (req, res) => exclusive(async () => {
  const client = { ...CLIENT_DEFAULTS, ...pickClientFields(req.body) };
  const error = validateClient(client);
  if (error) throw new HttpError(400, error);
  client.poc = await resolveOwner(client.poc);
  if (await clientsCol.findOne({ customerId: client.customerId })) rethrowDuplicate({ code: 11000 });
  await pushToSheet({ appends: [client] });

  const now = new Date().toISOString();
  const doc = { _id: randomUUID(), ...client, createdAt: now, updatedAt: now };
  await clientsCol.insertOne(doc).catch(rethrowDuplicate);
  await logActivity(doc, "Added to tracker", doc._id, now, doc.finalQcAt ? "final-qc" : "edit");
  res.status(201).json({ client: toApi(doc) });
}));

app.patch("/api/clients/:id", (req, res) => exclusive(async () => {
  const existing = await clientsCol.findOne({ _id: req.params.id });
  if (!existing) throw new HttpError(404, "Client not found in this tracker.");

  const changes = pickClientFields(req.body);
  const error = validateClient({ ...existing, ...changes });
  if (error) throw new HttpError(400, error);
  if ("poc" in changes && changes.poc !== existing.poc) changes.poc = await resolveOwner(changes.poc);
  if ("customerId" in changes && changes.customerId !== existing.customerId && (await clientsCol.findOne({ customerId: changes.customerId }))) {
    rethrowDuplicate({ code: 11000 });
  }
  await pushToSheet({ updates: [{ customerId: existing.customerId, client: { ...existing, ...changes } }] });

  const now = new Date().toISOString();
  const updated = await clientsCol
    .findOneAndUpdate({ _id: req.params.id }, { $set: { ...changes, updatedAt: now } }, { returnDocument: "after" })
    .catch(rethrowDuplicate);
  if (!updated) throw new HttpError(404, "Client not found in this tracker.");
  const summary = describeChanges(existing, changes);
  const kind = changes.finalQcAt && changes.finalQcAt !== existing.finalQcAt ? "final-qc" : "edit";
  if (summary) await logActivity(updated, summary, updated._id, now, kind);
  res.json({ client: toApi(updated) });
}));

app.delete("/api/clients/:id", (req, res) => exclusive(async () => {
  const existing = await clientsCol.findOne({ _id: req.params.id });
  if (!existing) throw new HttpError(404, "Client not found in this tracker.");
  await pushToSheet({ removes: [existing.customerId] });
  const deleted = await clientsCol.findOneAndDelete({ _id: req.params.id });
  if (!deleted) throw new HttpError(404, "Client not found in this tracker.");
  await logActivity(deleted, `Removed CL-${deleted.customerId} ${deleted.name}`, null, new Date().toISOString());
  res.json({ id: req.params.id, deleted: true });
}));

app.get("/api/owners", async (_req, res) => {
  const docs = await ownersCol.find().sort({ name: 1 }).collation(CASE_INSENSITIVE).toArray();
  res.json({ owners: docs.map(toApi) });
});

app.post("/api/owners", (req, res) => exclusive(async () => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 120) throw new HttpError(400, "Owner name is required (up to 120 characters).");
  if (await ownersCol.findOne({ name }, { collation: CASE_INSENSITIVE })) throw new HttpError(409, `"${name}" is already an owner.`);
  await pushToSheet({ ownerAdds: [name] });

  const doc = { _id: randomUUID(), name, createdAt: new Date().toISOString() };
  await ownersCol.insertOne(doc).catch((error) => {
    if (error?.code === 11000) throw new HttpError(409, `"${name}" is already an owner.`);
    throw error;
  });
  res.status(201).json({ owner: toApi(doc) });
}));

// Removing an owner unassigns their clients so no client points at a missing owner.
app.delete("/api/owners/:id", (req, res) => exclusive(async () => {
  const found = await ownersCol.findOne({ _id: req.params.id });
  if (!found) throw new HttpError(404, "Owner not found.");
  const affected = await clientsCol.find({ poc: found.name }, { collation: CASE_INSENSITIVE }).toArray();
  await pushToSheet({
    updates: affected.map((client) => ({ customerId: client.customerId, client: { ...client, poc: "" } })),
    ownerRemoves: [found.name],
  });

  const owner = await ownersCol.findOneAndDelete({ _id: req.params.id });
  if (!owner) throw new HttpError(404, "Owner not found.");
  const now = new Date().toISOString();
  if (affected.length) {
    await clientsCol.updateMany({ poc: owner.name }, { $set: { poc: "", updatedAt: now } }, { collation: CASE_INSENSITIVE });
    for (const client of affected) await logActivity(client, `POC → none (owner ${owner.name} removed)`, client._id, now);
  }
  res.json({ id: req.params.id, deleted: true, unassignedClients: affected.length });
}));

app.use("/api", (_req, _res) => {
  throw new HttpError(404, "Unknown API route.");
});

app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), "public")));

app.use((error, _req, res, _next) => {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error?.type === "entity.parse.failed") return res.status(400).json({ error: "Request body must be valid JSON." });
  console.error(error);
  res.status(500).json({ error: "Something went wrong on the server." });
});

const server = app.listen(PORT, () => {
  console.log(`Mapping Desk running at http://localhost:${PORT}/`);
});

if (sheet) {
  console.log(`Google Sheet is the main copy (via Apps Script), checked every ${SHEET_SYNC_MS / 1000}s.`);
  runSheetSync();
  setInterval(runSheetSync, SHEET_SYNC_MS);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close();
    mongo.close().finally(() => process.exit(0));
  });
}
