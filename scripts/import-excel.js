// Import clients from an Excel tracker sheet into MongoDB.
//
//   npm run import -- "C:\path\to\file.xlsx"            # preview only, writes nothing
//   npm run import -- "C:\path\to\file.xlsx" --write    # save to MongoDB
//
// Rows are matched to existing clients by Customer ID: existing clients are
// updated, new ones are inserted, and clients missing from the sheet are left alone.

import { randomUUID } from "node:crypto";

import ExcelJS from "exceljs";
import { MongoClient } from "mongodb";

import { CLIENT_DEFAULTS, STEP_FIELDS, validateClient } from "../lib/clients.js";

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
const write = args.includes("--write");

if (!file) {
  console.error('Usage: npm run import -- "path/to/file.xlsx" [--write]');
  process.exit(1);
}

// Sheet header (lower-cased, trimmed) → client field. "Mapping Status" is
// intentionally absent: the app recalculates it from the Final QC date.
const HEADERS = {
  "customer id": "customerId",
  "client name": "name",
  "number of sites": "siteCount",
  country: "country",
  "no. of na's": "naCount",
  "flag 10 review via report": "flag10At",
  "site with price n/a": "priceNaAt",
  "comp sites mapping review": "compReviewAt",
  "dashboard final qc": "finalQcAt",
  "comments, if any": "comments",
  poc: "poc",
  "lead 1": "lead1",
  "lead 2": "lead2",
};

function cellValue(cell) {
  const value = cell.value;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    if ("result" in value) return value.result; // formula
    if (value.richText) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return value.text; // hyperlink
  }
  return value;
}

function toText(value) {
  return value == null ? "" : String(value).trim();
}

function toCount(value) {
  if (value == null || toText(value) === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : NaN;
}

// Excel stores dates without a time zone; ExcelJS returns them as UTC midnight.
function toDate(value) {
  if (value == null || toText(value) === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = toText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : `invalid date "${text}"`;
}

function trackingGroupFor(comments) {
  const text = comments.toLowerCase();
  if (text.includes("no mapping needed")) return "nomap";
  if (text.includes("yet to receive mapping request")) return "await";
  return "cycle";
}

// ---------------------------------------------------------------------------
// Read the sheet
// ---------------------------------------------------------------------------

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(file);
const sheet = workbook.worksheets[0];

const columns = {};
sheet.getRow(1).eachCell((cell, col) => {
  const field = HEADERS[toText(cellValue(cell)).toLowerCase()];
  if (field) columns[field] = col;
});
const missing = Object.values(HEADERS).filter((field) => !columns[field]);
if (missing.length) {
  console.error(`The sheet is missing these columns: ${missing.join(", ")}`);
  process.exit(1);
}

const clients = new Map();
const skipped = [];

sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
  if (rowNumber === 1) return;
  const get = (field) => cellValue(row.getCell(columns[field]));

  const client = {
    ...CLIENT_DEFAULTS,
    customerId: toCount(get("customerId")),
    name: toText(get("name")),
    siteCount: toCount(get("siteCount")),
    country: toText(get("country")) || CLIENT_DEFAULTS.country,
    naCount: toCount(get("naCount")),
    comments: toText(get("comments")),
    poc: toText(get("poc")),
    lead1: toText(get("lead1")),
    lead2: toText(get("lead2")),
  };
  for (const field of STEP_FIELDS) client[field] = toDate(get(field));
  client.trackingGroup = trackingGroupFor(client.comments);

  if (!client.name) {
    skipped.push(`row ${rowNumber}: no client name`);
    return;
  }
  const error = validateClient(client);
  if (error) {
    skipped.push(`row ${rowNumber} (${client.name}): ${error}`);
    return;
  }
  const earlier = clients.get(client.customerId);
  if (earlier) {
    skipped.push(`row ${rowNumber} (${client.name}): customer ID ${client.customerId} already used on row ${earlier.rowNumber}`);
    return;
  }
  clients.set(client.customerId, { rowNumber, client });
});

const groups = { cycle: 0, await: 0, nomap: 0 };
for (const { client } of clients.values()) groups[client.trackingGroup] += 1;

console.log(`Read ${clients.size} clients from "${sheet.name}" (in cycle: ${groups.cycle}, awaiting request: ${groups.await}, no mapping needed: ${groups.nomap}).`);
if (skipped.length) {
  console.log(`Skipped ${skipped.length} row(s):`);
  for (const line of skipped) console.log(`  - ${line}`);
}

if (!write) {
  console.log("\nPreview only — nothing was saved. Run again with --write to save to MongoDB.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Save to MongoDB
// ---------------------------------------------------------------------------

if (!process.env.MONGODB_URI) {
  console.error("Missing MONGODB_URI in .env.");
  process.exit(1);
}

const mongo = new MongoClient(process.env.MONGODB_URI);
await mongo.connect();
try {
  const collection = mongo.db(process.env.MONGODB_DB || "mapping_desk").collection("clients");
  await collection.createIndex({ customerId: 1 }, { unique: true });
  const now = new Date().toISOString();
  const result = await collection.bulkWrite(
    [...clients.values()].map(({ client }) => ({
      updateOne: {
        filter: { customerId: client.customerId },
        update: { $set: { ...client, updatedAt: now }, $setOnInsert: { _id: randomUUID(), createdAt: now } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  console.log(`\nSaved to MongoDB: ${result.upsertedCount} added, ${result.modifiedCount} updated, ${result.matchedCount - result.modifiedCount} unchanged.`);

  // Make sure every POC in the sheet exists in the owners list.
  const owners = mongo.db(process.env.MONGODB_DB || "mapping_desk").collection("owners");
  const collation = { locale: "en", strength: 2 };
  await owners.createIndex({ name: 1 }, { unique: true, collation });
  let addedOwners = 0;
  for (const name of new Set([...clients.values()].map(({ client }) => client.poc).filter(Boolean))) {
    const upsert = await owners.updateOne({ name }, { $setOnInsert: { _id: randomUUID(), name, createdAt: now } }, { upsert: true, collation });
    addedOwners += upsert.upsertedCount;
  }
  if (addedOwners) console.log(`Added ${addedOwners} new owner(s) from the POC column.`);
} finally {
  await mongo.close();
}
