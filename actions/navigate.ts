/**
 * Navigate the UI to a view.
 *
 * Writes a navigate command to application state which the UI reads and auto-deletes.
 *
 * Usage:
 *   pnpm action navigate --view=home
 *   pnpm action navigate --path=/some/route
 *
 * Options:
 *   --view   View name to navigate to
 *   --path   URL path to navigate to
 *   --threadId Chat thread ID to open on the chat route
 */

import { defineAction } from "@agent-native/core/action";
import { writeAppStateForCurrentTab } from "@agent-native/core/application-state";
import { z } from "zod";

export default defineAction({
  description:
    "Navigate the UI to a specific view or path. Writes a navigate command to application state which the UI reads and auto-deletes. The default product surface is the home canvas at /; agent chat stays in the right rail.",
  schema: z.object({
    view: z.enum(["overview", "clients", "attention", "activity", "parked"]).optional().describe("Mapping Desk view: overview, clients, attention, activity, or parked"),
    path: z.string().optional().describe("Application path to navigate to"),
    clientId: z.string().uuid().optional().describe("Client record UUID to open in the detail sheet"),
    country: z.string().optional().describe("Optional country filter"),
    poc: z.string().optional().describe("Optional owner/POC filter"),
    status: z.enum(["overdue", "soon", "ok", "nodate"]).optional().describe("Optional cycle status filter"),
    q: z.string().optional().describe("Optional client search string"),
  }).refine((args) => Boolean(args.view || args.path || args.clientId), {
    message: "Provide a tracker view, application path, or client ID.",
  }),
  http: false,
  run: async (args) => {
    const nav: Record<string, string> = {};
    if (args.view ?? (args.clientId ? "clients" : undefined)) nav.view = args.view ?? "clients";
    if (args.path) nav.path = args.path;
    if (args.clientId) nav.clientId = args.clientId;
    if (args.country) nav.country = args.country;
    if (args.poc) nav.poc = args.poc;
    if (args.status) nav.status = args.status;
    if (args.q) nav.q = args.q;
    nav._writeId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await writeAppStateForCurrentTab("navigate", nav);
    return `Navigating to ${args.view || args.path}`;
  },
});
