# Mapping Desk

A client-mapping tracker for coordinators. It tracks client details, owners, mapping leads, notes, and four review dates (Flag 10 review → Price N/A review → Comp review → Final QC), with an overview of cycle status, clients by country, at-risk clients, and recent activity.

Data is stored in **MongoDB Atlas**. A small Node.js + Express server serves the website and the API.

## Setup

1. Install [Node.js](https://nodejs.org/) 22.9 or newer.
2. In MongoDB Atlas: create a cluster, add a database user, and allow your IP under **Network Access**.
3. Copy `.env.example` to `.env` and paste your connection string into `MONGODB_URI` (Atlas → Connect → Drivers).
4. Install and start:

```bash
npm install
npm start
```

Open http://localhost:3000/. Use `npm run dev` to restart automatically when `server.js` changes.

## Deploy on Render

The repo includes a Render Blueprint (`render.yaml`). The connection string is **not** in the code. You add it in Render as an environment variable.

1. In MongoDB Atlas → **Network Access**, add `0.0.0.0/0` (Render's free plan has no fixed IP).
2. In Render: **New → Blueprint**, connect this GitHub repo, and pick the `main` branch.
3. When Render asks for `MONGODB_URI`, paste your Atlas connection string (write any `@` in the password as `%40`). `MONGODB_DB` and `NODE_VERSION` are filled in automatically.
4. Click **Apply**. Render runs `npm ci`, then `npm start`, and checks `/api/health`. Your app URL is shown at the top of the service page.

To change the connection string later, open the service → **Environment** → edit `MONGODB_URI` → **Save, rebuild, and deploy**. Every push to `main` redeploys automatically. Data lives in Atlas, so deploys never touch it.

## Import from Excel

```bash
npm run import -- "C:\path\to\file.xlsx"           # preview: shows what would be imported
npm run import -- "C:\path\to\file.xlsx" --write   # save to MongoDB
```

The first sheet must have the tracker headers (Customer ID, Client Name, Number of Sites, Country, No. of NA's, Flag 10 Review via Report, Site with Price N/a, Comp Sites Mapping Review, Dashboard Final Qc, Comments If any, POC, Lead 1, Lead 2). Rows are matched by Customer ID, so re-importing updates existing clients instead of duplicating them. Comments containing "No mapping Needed" or "Yet to receive Mapping request" set the tracking state. The "Mapping Status" column is ignored because the app calculates status from the Final QC date.

## Data

Database `mapping_desk` (change with `MONGODB_DB`) has four collections:

- `clients`: one document per client. `_id` is a UUID string and `customerId` is unique.
- `activity`: a log entry for every add, update, and removal.
- `owners`: people who can be a client's POC. A client's POC must be an existing owner or empty (Unassigned). On first start the list is built from existing POC names, and the Excel import adds any new POC names.
- `settings`: one document holding the overdue window (`slaDays`, default 15).

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/clients` | Up to 500 clients, most recently updated first |
| GET | `/api/activity` | Latest changes (`?limit=` up to 200, `?clientId=` for one client's history) plus `total` and `cyclesClosedThisWeek` |
| POST | `/api/clients/bulk` | `{ ids, action }` with action `cycle-done` or `final-qc` (plus `date`) or `assign` (plus `poc`) |
| GET / PUT | `/api/settings` | The overdue window: `{ "slaDays": 15 }` (1–365) |
| POST | `/api/clients` | Create a client |
| PATCH | `/api/clients/:id` | Update fields on a client |
| DELETE | `/api/clients/:id` | Remove a client (activity is kept) |
| GET | `/api/owners` | All owners, A–Z |
| POST | `/api/owners` | Add an owner (`{ "name": "..." }`, unique ignoring case) |
| DELETE | `/api/owners/:id` | Remove an owner; their clients become Unassigned |

## Files

- `server.js`: Express server, validation, MongoDB access
- `public/index.html`, `public/styles.css`, `public/app.js`: the website
- `.env`: your secrets (never committed)
