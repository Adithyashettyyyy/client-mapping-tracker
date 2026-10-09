import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { MongoClient } from "mongodb";

import { CLIENT_DEFAULTS, CLIENT_FIELDS, STEP_FIELDS, TRIMMED_FIELDS, validateClient } from "./lib/clients.js";

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

app.get("/api/settings", async (_req, res) => {
  res.json({ settings: await getSettings() });
});

app.put("/api/settings", async (req, res) => {
  const slaDays = req.body?.slaDays;
  if (!Number.isInteger(slaDays) || slaDays < 1 || slaDays > 365) throw new HttpError(400, "Overdue window must be a whole number of days from 1 to 365.");
  const before = await getSettings();
  if (before.slaDays !== slaDays) {
    await settingsCol.updateOne({ _id: "app" }, { $set: { slaDays } }, { upsert: true });
    await logActivity(null, `Overdue window changed from ${before.slaDays} to ${slaDays} days`, null, new Date().toISOString(), "settings");
  }
  res.json({ settings: await getSettings() });
});

// Apply one action to many clients: mark the full cycle done, set Final QC, or reassign the owner.
app.post("/api/clients/bulk", async (req, res) => {
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
  const now = new Date().toISOString();
  await clientsCol.updateMany({ _id: { $in: targets.map((client) => client._id) } }, { $set: { ...set, updatedAt: now } });
  for (const client of targets) await logActivity(client, message, client._id, now, kind);
  res.json({ updated: targets.length });
});

app.post("/api/clients", async (req, res) => {
  const client = { ...CLIENT_DEFAULTS, ...pickClientFields(req.body) };
  const error = validateClient(client);
  if (error) throw new HttpError(400, error);
  client.poc = await resolveOwner(client.poc);

  const now = new Date().toISOString();
  const doc = { _id: randomUUID(), ...client, createdAt: now, updatedAt: now };
  await clientsCol.insertOne(doc).catch(rethrowDuplicate);
  await logActivity(doc, "Added to tracker", doc._id, now, doc.finalQcAt ? "final-qc" : "edit");
  res.status(201).json({ client: toApi(doc) });
});

app.patch("/api/clients/:id", async (req, res) => {
  const existing = await clientsCol.findOne({ _id: req.params.id });
  if (!existing) throw new HttpError(404, "Client not found in this tracker.");

  const changes = pickClientFields(req.body);
  const error = validateClient({ ...existing, ...changes });
  if (error) throw new HttpError(400, error);
  if ("poc" in changes && changes.poc !== existing.poc) changes.poc = await resolveOwner(changes.poc);

  const now = new Date().toISOString();
  const updated = await clientsCol
    .findOneAndUpdate({ _id: req.params.id }, { $set: { ...changes, updatedAt: now } }, { returnDocument: "after" })
    .catch(rethrowDuplicate);
  if (!updated) throw new HttpError(404, "Client not found in this tracker.");
  const summary = describeChanges(existing, changes);
  const kind = changes.finalQcAt && changes.finalQcAt !== existing.finalQcAt ? "final-qc" : "edit";
  if (summary) await logActivity(updated, summary, updated._id, now, kind);
  res.json({ client: toApi(updated) });
});

app.delete("/api/clients/:id", async (req, res) => {
  const deleted = await clientsCol.findOneAndDelete({ _id: req.params.id });
  if (!deleted) throw new HttpError(404, "Client not found in this tracker.");
  await logActivity(deleted, `Removed CL-${deleted.customerId} ${deleted.name}`, null, new Date().toISOString());
  res.json({ id: req.params.id, deleted: true });
});

app.get("/api/owners", async (_req, res) => {
  const docs = await ownersCol.find().sort({ name: 1 }).collation(CASE_INSENSITIVE).toArray();
  res.json({ owners: docs.map(toApi) });
});

app.post("/api/owners", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 120) throw new HttpError(400, "Owner name is required (up to 120 characters).");

  const doc = { _id: randomUUID(), name, createdAt: new Date().toISOString() };
  await ownersCol.insertOne(doc).catch((error) => {
    if (error?.code === 11000) throw new HttpError(409, `"${name}" is already an owner.`);
    throw error;
  });
  res.status(201).json({ owner: toApi(doc) });
});

// Removing an owner unassigns their clients so no client points at a missing owner.
app.delete("/api/owners/:id", async (req, res) => {
  const owner = await ownersCol.findOneAndDelete({ _id: req.params.id });
  if (!owner) throw new HttpError(404, "Owner not found.");

  const affected = await clientsCol.find({ poc: owner.name }, { collation: CASE_INSENSITIVE }).toArray();
  const now = new Date().toISOString();
  if (affected.length) {
    await clientsCol.updateMany({ poc: owner.name }, { $set: { poc: "", updatedAt: now } }, { collation: CASE_INSENSITIVE });
    for (const client of affected) await logActivity(client, `POC → none (owner ${owner.name} removed)`, client._id, now);
  }
  res.json({ id: req.params.id, deleted: true, unassignedClients: affected.length });
});

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

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close();
    mongo.close().finally(() => process.exit(0));
  });
}
