// Client record rules shared by the API server and the Excel importer.

export const STEP_FIELDS = ["flag10At", "priceNaAt", "compReviewAt", "finalQcAt"];
const STEP_LABELS = { flag10At: "Flag 10 review", priceNaAt: "Price N/A review", compReviewAt: "Comp review", finalQcAt: "Final QC" };
export const TRACKING_GROUPS = ["cycle", "await", "nomap"];
export const TRIMMED_FIELDS = ["name", "country", "poc", "lead1", "lead2"];
export const CLIENT_FIELDS = ["customerId", "name", "siteCount", "country", "naCount", ...STEP_FIELDS, "comments", "poc", "lead1", "lead2", "trackingGroup"];

export const CLIENT_DEFAULTS = {
  siteCount: null, naCount: null, country: "USA",
  flag10At: null, priceNaAt: null, compReviewAt: null, finalQcAt: null,
  comments: "", poc: "", lead1: "", lead2: "", trackingGroup: "cycle",
};

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Returns an error message for an invalid client, or null when it's valid. */
export function validateClient(client) {
  const isText = (value, max) => typeof value === "string" && value.length <= max;
  const isCount = (value) => value === null || (Number.isInteger(value) && value >= 0);

  if (!Number.isInteger(client.customerId) || client.customerId <= 0) return "Customer ID must be a positive whole number.";
  if (!isText(client.name, 200) || !client.name) return "Client name is required (up to 200 characters).";
  if (!isCount(client.siteCount)) return "Number of sites must be a whole number of 0 or more.";
  if (!isCount(client.naCount)) return "Sites with N/A pricing must be a whole number of 0 or more.";
  if (!isText(client.country, 80) || !client.country) return "Country is required (up to 80 characters).";
  for (const key of STEP_FIELDS) {
    if (client[key] !== null && !isValidDate(client[key])) return `${STEP_LABELS[key]}: use a valid calendar date (YYYY-MM-DD).`;
  }
  if (!isText(client.comments, 4000)) return "Notes can be up to 4000 characters.";
  if (![client.poc, client.lead1, client.lead2].every((value) => isText(value, 120))) return "Owner and lead names can be up to 120 characters.";
  if (!TRACKING_GROUPS.includes(client.trackingGroup)) return "Tracking state must be cycle, await, or nomap.";
  return null;
}
