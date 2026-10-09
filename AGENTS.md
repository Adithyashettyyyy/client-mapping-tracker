# App — Agent Guide

This starter ships as a blank Agent-Native app canvas — that describes its
initial state, not necessarily its current one. See `DEVELOPING.md` before
making any source code change.

## Skills

Search with `rg --hidden --follow`; read the exact linked guide before deeper work. `.agents/skills/build-an-app/SKILL.md` — start here for vague requests to create a domain app. `.agents/skills/adding-a-feature/SKILL.md` — cross-area feature checklist. Data/integrations: `.agents/skills/actions/SKILL.md`, `.agents/skills/storing-data/SKILL.md`, `.agents/skills/security/SKILL.md`, `.agents/skills/secrets/SKILL.md`, `.agents/skills/sharing/SKILL.md`. UI: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/shadcn-ui/SKILL.md`, `.agents/skills/client-side-routing/SKILL.md`. Agent context/workflows: `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.agents/skills/reliable-mutations/SKILL.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/delegate-to-agent/SKILL.md`. Framework: `.agents/skills/agent-native-docs/SKILL.md`, `.agents/skills/agent-native-toolkit/SKILL.md`, `.agents/skills/customizing-agent-native/SKILL.md`.

Use local docs only (no web research): `pnpm action docs-search --query "<topic>"`, `pnpm action docs-search --slug "<slug>"`, `pnpm action docs-search --list`, `pnpm action source-search --query "<pattern>"`, `pnpm action source-search --path <path>`, or `pnpm action source-search --list`. For external-agent integrations, read `pnpm action docs-search --slug "external-agents"`.

This repo is a single standalone app (`agent-native.scaffold.shape:
"standalone"`), not a workspace root. If the user asks for a workspace, a
platform or suite of apps, a second app, an app shell or launcher, or Dispatch,
read the `multi-app-workspace` skill before touching the repo layout.

## Core rules

- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.
- Normal app data must flow through actions. Keep actions deterministic and focused; use agent chat/AgentSidebar for AI work and follow-ups in the same thread. Keep structured state in SQL and large files in configured storage; persist references only.
- For external integrations, inspect the workspace/provider connection catalog first; reuse its scoped resolver. Never hardcode credentials, webhook URLs, or private/customer data.
- Never fabricate. Report failures and recover; verify writes by reading the row or screen. Navigation is in `<current-screen>`; use `view-screen` for fresh visible-record details.

For custom branding, keep `server/plugins/agent-native-email-branding.ts` aligned: `app.name` appears in transactional email and optional `app.logoUrl` must be an absolute HTTPS URL.

## Application state

- `navigation` describes the tracker view, selected client, and active filters. The Mapping Desk home view is `overview` at `/`; client records open with `clientId` in the query string.
- Use `navigate` to switch tracker views or open a client; use `view-screen` for a fresh read of the visible client details.

## Building a domain app

Mapping Desk is a client-mapping tracker at `/`. Client records and activity use the shared `public` scope because this app does not require login; customer IDs are unique in that tracker. Cycle dates use `YYYY-MM-DD`; a cycle is overdue more than 15 days after Final QC. Expose `navigation.view`, `clientId`, `country`, `poc`, `status`, `query`, and `creatingClient` to the agent.

| Action | Use |
| --- | --- |
| `list-clients` | Read up to 500 client records for the current scope. |
| `list-activity` | Read the latest 30 tracker changes. |
| `create-client` | Create a client; preserve the returned UUID. |
| `update-client` | Patch a client by UUID; `null` clears a date or count. |
| `delete-client` | Remove a client by UUID; activity is retained. |
| `navigate` | Open a tracker view or selected client; optional `country`, `poc`, `status`, and `q` set filters. |
| `view-screen` | Read current navigation and selected-client details. |

Use `adding-a-feature` and `frontend-design` for follow-up functionality. Verify writes by reading the action-backed screen; run `pnpm typecheck`, `pnpm agent-native:doctor`, and a browser smoke of the client workflow.

Before building common workspace or agent UI, read `agent-native-toolkit`; for supported customization, read `customizing-agent-native`.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.
