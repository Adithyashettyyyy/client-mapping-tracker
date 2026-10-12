// Google Sheet link. When configured, the sheet is the main copy of the client
// list: the server reads it every few seconds and copies changes into MongoDB,
// and every dashboard edit is written to the sheet before it is saved to MongoDB.
//
// The server talks to the sheet through the Apps Script web app in
// apps-script/Code.gs, which reads the sheet and applies cell edits for it.
//
// Rows are matched to clients by Customer ID, so sorting or filtering the sheet
// is safe. Only the columns in HEADERS are read or written; anything else in the
// sheet (such as the "Mapping Status" formula column) is left alone.

import { CLIENT_DEFAULTS, STEP_FIELDS, validateClient } from "./clients.js";

// Sheet header (lower-cased, trimmed) → client field.
export const HEADERS = {
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
export const SHEET_FIELDS = Object.values(HEADERS);
const STATUS_HEADER = "mapping status";
const COUNT_FIELDS = ["customerId", "siteCount", "naCount"];

/** Reads the SHEET_* settings; returns null when the sheet link isn't set up. */
export function sheetConfigFromEnv(env) {
  const scriptUrl = env.SHEET_SCRIPT_URL?.trim();
  if (!scriptUrl) return null;
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(scriptUrl)) {
    throw new Error("SHEET_SCRIPT_URL should be the Apps Script web app URL, like https://script.google.com/macros/s/…/exec");
  }
  const secret = env.SHEET_SYNC_SECRET?.trim() ?? "";
  if (secret.length < 24) throw new Error("SHEET_SYNC_SECRET must be set to a random value of at least 24 characters (the same one saved in the Apps Script).");
  return { scriptUrl, secret, tab: env.SHEET_TAB?.trim() || "" };
}

// ---------------------------------------------------------------------------
// Cell values ↔ client fields
// ---------------------------------------------------------------------------

const SERIAL_EPOCH = Date.UTC(1899, 11, 30); // Google Sheets day 0

function toText(value) {
  return value == null ? "" : String(value).trim();
}

function toCount(value, label) {
  const text = toText(value);
  if (text === "") return { value: null };
  const number = Number(text);
  return Number.isInteger(number) ? { value: number } : { error: `${label} "${text}" isn't a whole number.` };
}

function toDate(value, label) {
  if (typeof value === "number") return { value: new Date(SERIAL_EPOCH + Math.floor(value) * 86_400_000).toISOString().slice(0, 10) };
  const text = toText(value);
  if (text === "") return { value: null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return { value: text };
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return { value: `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}` };
  return { error: `${label} "${text}" isn't a date.` };
}

function trackingGroupFor(comments) {
  const text = comments.toLowerCase();
  if (text.includes("no mapping needed")) return "nomap";
  if (text.includes("yet to receive mapping request")) return "await";
  return "cycle";
}

const LABELS = {
  customerId: "Customer ID", siteCount: "Number of sites", naCount: "No. of NA's",
  flag10At: "Flag 10 review", priceNaAt: "Price N/A review", compReviewAt: "Comp review", finalQcAt: "Final QC",
};

/** Turns one sheet row into client fields, or an error message. */
function parseRow(cells, columns) {
  const get = (field) => cells[columns[field]];
  const client = {};
  for (const field of SHEET_FIELDS) {
    let result;
    if (COUNT_FIELDS.includes(field)) result = toCount(get(field), LABELS[field]);
    else if (STEP_FIELDS.includes(field)) result = toDate(get(field), LABELS[field]);
    else result = { value: toText(get(field)) };
    if (result.error) return { error: result.error, customerId: client.customerId ?? null };
    client[field] = result.value;
  }
  client.country ||= CLIENT_DEFAULTS.country;
  const error = validateClient({ ...CLIENT_DEFAULTS, ...client });
  return error ? { error, customerId: client.customerId } : { client };
}

// The overdue window lives in the Mapping Status formula, e.g. IF(TODAY()-K2>15, "⚠️ Overdue…", "On Track").
const WINDOW_PATTERN = /(TODAY\(\)\s*-\s*\$?[A-Z]{1,3}\$?\d+\s*>\s*)(\d+)/gi;

/** The formula with its overdue window set to `days`. */
export function withWindow(formula, days) {
  return formula.replace(WINDOW_PATTERN, (_, head) => head + days);
}

/** Moves a formula from one row to another: relative references like K2 become K7 (absolute rows like K$2 stay). */
export function formulaForRow(formula, fromRow, toRow) {
  return formula.replace(new RegExp(`(?<![A-Za-z0-9_$])(\\$?[A-Z]{1,3})${fromRow}(?![0-9(])`, "g"), `$1${toRow}`);
}

/** Valid client rows whose Mapping Status cell has no formula. */
export function rowsMissingFormula(sheet) {
  if (sheet.statusColumn < 0 || !sheet.statusFormulas.length) return [];
  const withFormula = new Set(sheet.statusFormulas.map((cell) => cell.row));
  return [...sheet.rows.values()].map((row) => row.rowNumber).filter((row) => !withFormula.has(row));
}

/**
 * Parses the sheet's values into rows keyed by Customer ID. Blank rows are
 * skipped; invalid or duplicate rows become problems. `formulas` (same shape
 * as `values`) gives the Mapping Status formulas and their overdue windows.
 */
export function parseSheet(values, formulas = []) {
  const header = (values[0] ?? []).map((cell) => toText(cell).toLowerCase());
  const columns = {};
  header.forEach((name, index) => {
    if (HEADERS[name] && !(HEADERS[name] in columns)) columns[HEADERS[name]] = index;
  });
  const missing = Object.entries(HEADERS).filter(([, field]) => !(field in columns)).map(([name]) => name);
  if (missing.length) throw new Error(`The sheet's first row is missing these column headers: ${missing.join(", ")}.`);

  const statusColumn = header.indexOf(STATUS_HEADER);
  const rows = new Map(); // customerId → { rowNumber, client, cells }
  const problems = [];
  const problemIds = new Set();
  let lastRow = 1;

  values.forEach((cells, index) => {
    if (index === 0) return;
    const rowNumber = index + 1;
    if (SHEET_FIELDS.every((field) => toText(cells[columns[field]]) === "")) return;
    lastRow = rowNumber;
    const { client, error, customerId } = parseRow(cells, columns);
    if (error) {
      problems.push({ row: rowNumber, message: error });
      if (customerId) problemIds.add(customerId);
      return;
    }
    const earlier = rows.get(client.customerId);
    if (earlier) {
      problems.push({ row: rowNumber, message: `Customer ID ${client.customerId} is already used on row ${earlier.rowNumber}, so this row is ignored.` });
      return;
    }
    rows.set(client.customerId, { rowNumber, client, cells });
  });

  const statusFormulas = []; // { row, formula, days }
  if (statusColumn >= 0) {
    formulas.forEach((cells, index) => {
      const formula = index > 0 ? cells?.[statusColumn] : "";
      const match = formula && new RegExp(WINDOW_PATTERN.source, "i").exec(formula);
      if (match) statusFormulas.push({ row: index + 1, formula, days: Number(match[2]) });
    });
  }

  return { columns, statusColumn, statusFormulas, rows, problems, problemIds, lastRow };
}

export const OWNERS_TAB = "Owners";

/** Parses the Owners tab: an "Owner" header, then one name per row. */
export function parseOwners(values) {
  const names = new Map(); // lower-cased name → { rowNumber, name }
  const problems = [];
  let lastRow = 1;
  values.forEach((cells, index) => {
    if (index === 0) return;
    const name = toText(cells[0]).replace(/\s+/g, " ");
    if (!name) return;
    const rowNumber = index + 1;
    lastRow = rowNumber;
    const earlier = names.get(name.toLowerCase());
    if (name.length > 120) problems.push({ tab: OWNERS_TAB, row: rowNumber, message: "Owner names can be up to 120 characters." });
    else if (earlier) problems.push({ tab: OWNERS_TAB, row: rowNumber, message: `"${name}" is already listed on row ${earlier.rowNumber}.` });
    else names.set(name.toLowerCase(), { rowNumber, name });
  });
  return { names, problems, lastRow };
}

export function newClientFromSheet(client) {
  return { ...CLIENT_DEFAULTS, ...client, trackingGroup: trackingGroupFor(client.comments) };
}

/** Value to write for a field. Text that Sheets would turn into a number, date or formula is prefixed with ' to keep it as text. */
function cellFor(field, value) {
  if (value == null) return "";
  if (typeof value === "number") return value;
  if (STEP_FIELDS.includes(field)) return value; // YYYY-MM-DD; the Apps Script stores it as a date
  return /^[=+\-@']|^[\d\s.,:/-]+$|^(true|false)$/i.test(value) ? `'${value}` : value;
}

// ---------------------------------------------------------------------------
// Apps Script web app
// ---------------------------------------------------------------------------

export class SheetLink {
  constructor({ scriptUrl, secret, tab }) {
    this.scriptUrl = scriptUrl;
    this.secret = secret;
    this.tab = tab;
    this.url = null; // the sheet's own URL, learned on the first read
  }

  /** Calls the Apps Script web app. It answers { error } or the action's result. */
  async call(action, payload = {}) {
    const response = await fetch(this.scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret: this.secret, tab: this.tab, action, ...payload }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`The Apps Script web app didn't answer (HTTP ${response.status}). Check it is deployed with "Who has access: Anyone" and SHEET_SCRIPT_URL is the /exec URL.`);
    }
    if (data.error) throw new Error(`Apps Script: ${data.error}`);
    return data;
  }

  /** Reads and parses the clients tab and the Owners tab (owners is null when that tab doesn't exist yet). */
  async read() {
    const { url, title, rowCount, values, formulas, owners } = await this.call("read");
    this.url = url;
    return { tab: { title, rowCount }, ...parseSheet(values, formulas), owners: owners ? parseOwners(owners) : null };
  }

  /**
   * Applies client changes to the sheet in one call.
   *   updates: [{ customerId, client }]  customerId is the row to change (the client's ID before the edit)
   *   appends: [client]                  new rows after the last filled row
   *   removes: [customerId]
   *   ownerAdds, ownerRemoves: [name]   rows in the Owners tab (created if missing)
   *   slaDays                           overdue window to put in every Mapping Status formula
   *   formulaRows: [rowNumber]          rows that need the Mapping Status formula added
   * Only cells whose value changes are written.
   */
  async write({ updates = [], appends: newClients = [], removes = [], ownerAdds = [], ownerRemoves = [], slaDays = null, formulaRows = [] }, sheet) {
    const { tab, columns, statusColumn, statusFormulas, rows, lastRow, owners } = sheet ?? (await this.read());
    const appends = [...newClients];
    const cells = new Map(); // row → Map(column → value), 1-based

    const setCell = (rowNumber, field, value) => {
      if (!cells.has(rowNumber)) cells.set(rowNumber, new Map());
      cells.get(rowNumber).set(columns[field] + 1, cellFor(field, value));
    };

    for (const { customerId, client } of updates) {
      const row = rows.get(customerId);
      if (!row) {
        appends.push(client);
        continue;
      }
      for (const field of SHEET_FIELDS) {
        if (field in client && (client[field] ?? null) !== (row.client[field] ?? null)) setCell(row.rowNumber, field, client[field]);
      }
    }

    const ops = [];
    const firstNew = lastRow + 1;
    appends.forEach((client, index) => {
      for (const field of SHEET_FIELDS) if (client[field] != null && client[field] !== "") setCell(firstNew + index, field, client[field]);
    });
    if (appends.length) {
      const lastNew = firstNew + appends.length - 1;
      if (lastNew > tab.rowCount) ops.push({ op: "addRows", count: lastNew - tab.rowCount });
      if (firstNew > 2) {
        // Copy formatting (date formats etc.) and the Mapping Status formula from the row above.
        ops.push({ op: "copyFormat", fromRow: firstNew - 1, toRow: firstNew, numRows: appends.length });
        if (statusColumn >= 0) ops.push({ op: "copyFormula", column: statusColumn + 1, fromRow: firstNew - 1, toRow: firstNew, numRows: appends.length });
      }
    }

    // Neighbouring cells in a row are written together.
    for (const [row, byColumn] of cells) {
      const columnsInRow = [...byColumn.keys()].sort((a, b) => a - b);
      let start = 0;
      for (let i = 1; i <= columnsInRow.length; i++) {
        if (i < columnsInRow.length && columnsInRow[i] === columnsInRow[i - 1] + 1) continue;
        const run = columnsInRow.slice(start, i);
        ops.push({ op: "set", row, column: run[0], values: run.map((column) => byColumn.get(column)) });
        start = i;
      }
    }

    // Mapping Status formulas: a new window rewrites the existing ones, and rows without one get a copy.
    const formulaWrites = new Map(); // row → formula
    if (slaDays != null) {
      for (const cell of statusFormulas) if (cell.days !== slaDays) formulaWrites.set(cell.row, withWindow(cell.formula, slaDays));
    }
    const template = statusFormulas[0];
    if (template) {
      for (const row of formulaRows) {
        const formula = formulaForRow(template.formula, template.row, row);
        formulaWrites.set(row, slaDays != null ? withWindow(formula, slaDays) : formula);
      }
    }
    const formulaRowNumbers = [...formulaWrites.keys()].sort((a, b) => a - b);
    for (let i = 0; i < formulaRowNumbers.length; ) {
      let j = i + 1;
      while (j < formulaRowNumbers.length && formulaRowNumbers[j] === formulaRowNumbers[j - 1] + 1) j++;
      const run = formulaRowNumbers.slice(i, j);
      ops.push({ op: "formulas", row: run[0], column: statusColumn + 1, formulas: run.map((row) => formulaWrites.get(row)) });
      i = j;
    }

    // Delete bottom-up so earlier row numbers stay valid.
    const doomed = removes.map((id) => rows.get(id)?.rowNumber).filter(Boolean).sort((a, b) => b - a);
    if (doomed.length) ops.push({ op: "deleteRows", rows: doomed });

    const listed = new Set(owners ? owners.names.keys() : []);
    let ownerRow = owners?.lastRow ?? 1;
    for (const name of ownerAdds) {
      if (listed.has(name.toLowerCase())) continue;
      listed.add(name.toLowerCase());
      ops.push({ op: "set", sheet: "owners", row: ++ownerRow, column: 1, values: [cellFor("poc", name)] });
    }
    const ownerRows = ownerRemoves.map((name) => owners?.names.get(name.toLowerCase())?.rowNumber).filter(Boolean).sort((a, b) => b - a);
    if (ownerRows.length) ops.push({ op: "deleteRows", sheet: "owners", rows: ownerRows });

    if (ops.length) await this.call("apply", { ops });
  }
}
