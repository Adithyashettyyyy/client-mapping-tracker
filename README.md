# Mapping Desk

A client-mapping tracker for the mapping team. It tracks every client through the four-step mapping cycle (**Flag 10 review → Sites with price N/A → Comp sites mapping review → Dashboard final QC**) and shows who owns each client, what is overdue, and what changed.

**Live app: https://client-mapping-tracker.onrender.com**

> The free Render plan sleeps after about 15 minutes without visitors, so the first visit after a quiet period takes 30–60 seconds to load. No data is lost.

Data is stored in **MongoDB Atlas**. A small **Node.js + Express** server serves the website and the API. The front end is plain HTML, CSS, and JavaScript with no build step.

---

## Features

### Overview
- Greeting with a one-line summary of what is overdue and what crosses the window this week.
- Status tiles: **Overdue**, **Due in 7 days**, **On track**, **No date yet**. Click one to see those clients.
- **Needs attention** list of the oldest overdue and due-soon clients, each with a **Mark cycle done** button.
- **Team** cards: one per owner, with a **pie chart** of their clients by status, the share "in window", client and site counts, and an *At risk / Slipping / On track* tag.
- **What changed** live feed, **Steps missing a date** bars, **By country** counts with overdue badges, and the number of cycles closed in the last 7 days.

### Owners
- Add and remove owners from the sidebar (**+ Add owner** or **Manage**). Names are unique, ignoring case.
- Removing an owner asks for confirmation and sets their clients to **Unassigned**.
- **Owner page** (click an owner in the sidebar or a team card): a large pie chart plus clients, sites, open N/As, average days since QC, and the oldest final QC. Click a pie slice or legend line to filter by status.
- The sidebar shows a colour per owner and a red count of their overdue clients.

### Clients
- **Add**: **New client** button (or press `C`).
- **Edit**: click a client to open its panel, change fields, then **Save changes**.
- **Remove**: in the client panel, **Remove**, then confirm. The activity history is kept.
- Each step has a date picker and a **Today** button, and shows how many days ago it was done. **Mark cycle done today** sets all four steps at once.
- The client panel shows the client's own **History** of changes.
- The Owner / POC field is a dropdown of your owners, so names can't be mistyped.

### Client table
- Views: **All clients**, **Needs attention**, **Not in cycle** (awaiting a request or no mapping needed).
- Filter by status, owner, and country, or search by name, ID, comment, POC, or lead. **Clear filters** resets them.
- Sort by key, client, status, POC, days since QC, sites, or N/A count.
- Step dots show each date and turn amber or red as dates get old.
- **Bulk actions**: tick clients to **Mark cycle done today**, set **Final QC today**, or **Reassign POC** for all of them at once.

### Other
- **Overdue window**: clients turn overdue a set number of days after Final QC (default 15). Change it from the bottom of the sidebar.
- **Activity log** of every change, with details such as "Final QC → 10/8; POC → Rayan".
- **Export CSV** in the same column layout as the team's Excel tracker.
- **Import from Excel** (see below).
- Light and dark theme, and keyboard shortcuts: `/` to search, `C` for a new client, `Esc` to close.
- Agent panel: coming soon.

### How status works
| Status | Rule |
| --- | --- |
| On track | Final QC within the window, with more than 7 days left |
| Due in N days | Final QC within the last 7 days of the window |
| Overdue | More than the window (default 15 days) since Final QC |
| No date | In the cycle but no Final QC date yet |
| Awaiting request / No mapping needed | Not in the cycle |

---

## Run locally

1. Install [Node.js](https://nodejs.org/) 22.9 or newer.
2. In MongoDB Atlas: create a cluster, add a database user, and allow your IP under **Network Access**.
3. Copy `.env.example` to `.env` and paste your connection string into `MONGODB_URI` (Atlas → Connect → Drivers). Write any `@` in the password as `%40`.
4. Install and start:

```bash
npm install
npm start
```

Open http://localhost:3000/. Use `npm run dev` to restart automatically when `server.js` changes.

`.env` holds the database password. It is git-ignored and must never be committed.

## Deploy on Render

The app is deployed at **https://client-mapping-tracker.onrender.com** as a Render web service connected to this repo. Every push to `main` redeploys automatically. Data lives in Atlas, so deploys never touch it.

| Setting | Value |
| --- | --- |
| Language | Node |
| Branch | `main` |
| Build command | `npm ci` |
| Start command | `npm start` |
| Health check path | `/api/health` |
| Environment variables | `MONGODB_URI` (secret), `MONGODB_DB=mapping_desk`, `NODE_VERSION=24`; for Sheet sync also `SHEET_SCRIPT_URL` and `SHEET_SYNC_SECRET` (secret) |

To set it up again from scratch:
1. In MongoDB Atlas → **Network Access**, add `0.0.0.0/0` (Render's free plan has no fixed IP).
2. In Render, create a **Web Service** from this repo with the settings above, or use **New → Blueprint**, which reads `render.yaml`.
3. Add `MONGODB_URI` under **Environment**. It is never stored in the code.

To change the database password: update it in Atlas, then in Render (**Environment** → edit `MONGODB_URI` → **Save, rebuild, and deploy**) and in your local `.env`.

## Google Sheet sync

Optional. When `SHEET_SCRIPT_URL` is set, a Google Sheet becomes the **main copy** of the client list. The server talks to the sheet through a small Apps Script web app ([apps-script/Code.gs](apps-script/Code.gs)) that lives inside the sheet, so no Google Cloud project is needed.

- **Sheet → dashboard:** the script pings the server when the sheet is edited, and the server also reads the sheet every 30 seconds and whenever the dashboard loads. Each time it makes MongoDB match the sheet: changed rows are updated, new rows are added, deleted rows are removed. Changes are logged in activity as "From Google Sheet".
- **Dashboard → sheet:** every edit is written to the sheet first, then to MongoDB. If the sheet can't be updated, the edit isn't saved.
- **Matching:** rows are matched by Customer ID, so sorting and filtering the sheet is safe. Only the tracker columns (same headers as the Excel import) are read or written; other columns, such as the "Mapping Status" formula, are left alone. New rows copy formatting from the row above, and every client row gets the Mapping Status formula (with the current overdue window), including rows typed straight into the sheet.
- **Rows with problems** (bad date, duplicate Customer ID, missing name) are skipped and listed under "Google Sheet" in the sidebar; the dashboard keeps that client's last good values.
- **Safety:** a sync never removes more than 5 clients at once. If more rows disappear, it reports it instead.
- **Owners:** an **Owners** tab (header "Owner", one name per row) is the owners list. It is created from the current owners on the first sync. Adding a name adds the owner; removing a name removes the owner and clears that POC on their client rows (in the sheet and the dashboard). Adding or removing an owner on the dashboard updates the tab, and a new POC name typed in a client row is added to the tab. The same 5-at-once removal limit applies.
- **Overdue window:** it is the number in the Mapping Status formula (`TODAY()-K2>15`). Changing the window on the dashboard rewrites that number in every Mapping Status formula. Editing the number in any one formula in the sheet changes the dashboard window, and the other formulas are updated to match.
- **Tracking state** stays on the dashboard (new rows get it from their comments).
- While the sheet link is on, don't use the Excel importer: the next sync would overwrite its changes with the sheet.

Setup:
1. In the sheet: **Extensions → Apps Script**. Replace everything in `Code.gs` with [apps-script/Code.gs](apps-script/Code.gs) and save.
2. **Project Settings → Script properties**: add `SYNC_SECRET` (a long random value) and `SERVER_URL` (the dashboard address).
3. In the editor, pick `setUpTrigger` and click **Run**, then allow the permissions Google asks for.
4. **Deploy → New deployment → Web app**, Execute as **Me**, Who has access **Anyone**. Copy the URL ending in `/exec`.
5. Set `SHEET_SCRIPT_URL` (that URL) and `SHEET_SYNC_SECRET` (the same secret) in `.env` locally and under **Environment** on Render. `SHEET_TAB` picks a tab by name (default: the first tab).

When `Code.gs` changes, paste the new version and use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.

## Import from Excel

```bash
npm run import -- "C:\path\to\file.xlsx"           # preview: shows what would be imported
npm run import -- "C:\path\to\file.xlsx" --write   # save to MongoDB
```

- **Headers:** the first sheet needs the tracker headers (Customer ID, Client Name, Number of Sites, Country, No. of NA's, Flag 10 Review via Report, Site with Price N/a, Comp Sites Mapping Review, Dashboard Final Qc, Comments If any, POC, Lead 1, Lead 2).
- **Re-importing:** rows are matched by Customer ID, so a re-import updates existing clients instead of duplicating them.
- **Tracking state:** comments containing "No mapping Needed" or "Yet to receive Mapping request" set it.
- **Owners:** new POC names are added to the owners list.
- **Ignored column:** "Mapping Status" is skipped because the app calculates status from the Final QC date.

## Data

Database `mapping_desk` (change it with `MONGODB_DB`) has four collections:

- `clients`: one document per client. `_id` is a UUID string and `customerId` is unique.
- `activity`: a log entry for every change, kept even after a client is removed.
- `owners`: people who can be a client's POC. A client's POC must be an existing owner or empty (Unassigned).
- `settings`: one document holding the overdue window (`slaDays`, default 15).

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Checks the app can reach the database |
| GET | `/api/clients` | Up to 500 clients, most recently updated first |
| POST | `/api/clients` | Create a client |
| PATCH | `/api/clients/:id` | Update fields on a client |
| DELETE | `/api/clients/:id` | Remove a client (activity is kept) |
| POST | `/api/clients/bulk` | `{ ids, action }`, where action is `cycle-done` or `final-qc` (with `date`) or `assign` (with `poc`) |
| GET | `/api/activity` | Latest changes (`?limit=` up to 200, `?clientId=` for one client's history), plus `total` and `cyclesClosedThisWeek` |
| GET | `/api/owners` | All owners, A–Z |
| POST | `/api/owners` | Add an owner: `{ "name": "..." }` |
| DELETE | `/api/owners/:id` | Remove an owner; their clients become Unassigned |
| GET | `/api/sheet` | Google Sheet sync status: last sync time, errors, rows to fix |
| POST | `/api/sheet/sync` | Called by the Apps Script on sheet edits: `{ "secret": "..." }` |
| GET / PUT | `/api/settings` | The overdue window: `{ "slaDays": 15 }` (1–365) |

## Project structure

```
server.js               Express server: API, validation, MongoDB access
lib/clients.js          Client field rules shared by the server and the importer
lib/sheets.js           Google Sheet link: reads and writes the sheet
apps-script/Code.gs     Apps Script pasted into the sheet (web app + edit trigger)
scripts/import-excel.js Excel importer (npm run import)
public/index.html       Page layout
public/styles.css       Design
public/app.js           Front-end logic
render.yaml             Render deployment settings
.env.example            Template for local settings (copy to .env)
```

