# Mapping Desk — Agent Guide

Node.js + Express server (`server.js`) backed by MongoDB Atlas, serving a plain HTML/CSS/JS front end from `public/`. No build step. Run with `npm start` (reads `.env`).

- `server.js`: REST API under `/api` (clients CRUD + activity), validation, and static file serving. Only known client fields are written, and every write appends to the `activity` collection.
- `public/app.js`: UI state lives in the URL hash; data comes from `/api`. Client-side validation mirrors the server's, but the server is authoritative.
- `public/styles.css`: design tokens are the `--md-*` HSL variables on `:root` (dark) and `html.light`.
- Secrets live in `.env` (git-ignored). Never commit or print `MONGODB_URI`.

Domain rules: cycle dates are `YYYY-MM-DD`. A client is overdue more than 15 days after Final QC, and "due soon" at 9–15 days. `customerId` is unique (enforced by an index). Owners live in the `owners` collection (names unique ignoring case). A client `poc` must match an owner or be empty, and removing an owner unassigns their clients.

The agent rail is a "Coming soon" placeholder with no agent backend.
