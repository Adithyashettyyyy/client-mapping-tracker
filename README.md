# Mapping Desk

Mapping Desk is a client-mapping tracker for coordinators. It tracks client details, owners, mapping leads, notes, and four review dates, with an overview of cycle status, client distribution by country, at-risk clients, and recent activity.

## Features

- Dashboard counts and charts are derived from saved client records.
- Search and filter by status, owner, and country.
- Create, edit, and remove client records; changes are recorded in the activity history.
- Export the client register as CSV.
- UI and Agent-Native agent share the same database-backed actions.

## Data and database

Structured app data is stored in PostgreSQL through Drizzle ORM. The schema is in `drizzle/schema.ts`; migrations are in `drizzle/migrations/`. The `mapping_clients` table stores tracker records, and `mapping_activities` stores the change history. The overview charts are derived from records returned by the `list-clients` action; they do not use hard-coded sample data.

For local development, the Agent-Native starter provides its local database setup. For deployments where data must survive restarts, configure `DATABASE_URL` with a persistent PostgreSQL connection. If your database provider supplies a separate unpooled connection string for migrations, configure `DATABASE_URL_UNPOOLED` as well. Keep database credentials in Builder's environment/secret settings; do not commit them.

This app does not require login, so tracker records use a shared `public` scope. Anyone with access to the app can view and edit those records. PostgreSQL/Drizzle is the primary data store; MongoDB is not connected.

## Develop locally

```bash
corepack enable
pnpm install
pnpm dev
```

Generate and apply schema changes with:

```bash
pnpm db:generate
pnpm db:migrate
```

## Checks

```bash
pnpm typecheck
pnpm agent-native:doctor
```

## Project layout

- `app/`: React routes, components, and styles
- `actions/`: database operations shared by the UI and agent
- `server/`: database client and server plugins
- `drizzle/schema.ts`: PostgreSQL table definitions
- `drizzle/migrations/`: generated migrations

Client records are listed by `list-clients`; create, edit, and delete operations use `create-client`, `update-client`, and `delete-client`. Recent history is available through `list-activity`.

Framework documentation: [Agent-Native](https://agent-native.com/docs).
