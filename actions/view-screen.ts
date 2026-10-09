/**
 * See what the user is currently looking at on screen.
 *
 * Reads and returns the current navigation state from application state.
 *
 * Usage:
 *   pnpm action view-screen
 */

import { and, eq } from "drizzle-orm";
import { defineAction } from "@agent-native/core/action";
import { readAppState } from "@agent-native/core/application-state";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { mappingScope } from "../server/mapping-scope.js";

export default defineAction({
  description:
    "See what the user is currently looking at on screen. Returns the current navigation state for the app canvas plus agent rail. Always call this first before taking any action.",
  schema: z.object({}),
  http: false,
  readOnly: true,
  run: async () => {
    const navigation = await readAppState("navigation");
    const screen: Record<string, unknown> = {};
    if (navigation) screen.navigation = navigation;

    if (navigation && typeof navigation === "object" && "clientId" in navigation && typeof navigation.clientId === "string") {
      const { scopeKey } = mappingScope();
      const [client] = await getDb()
        .select({
          id: schema.mappingClients.id,
          customerId: schema.mappingClients.customerId,
          name: schema.mappingClients.name,
          country: schema.mappingClients.country,
          poc: schema.mappingClients.poc,
          trackingGroup: schema.mappingClients.trackingGroup,
          flag10At: schema.mappingClients.flag10At,
          priceNaAt: schema.mappingClients.priceNaAt,
          compReviewAt: schema.mappingClients.compReviewAt,
          finalQcAt: schema.mappingClients.finalQcAt,
          comments: schema.mappingClients.comments,
        })
        .from(schema.mappingClients)
        .where(and(eq(schema.mappingClients.id, navigation.clientId), eq(schema.mappingClients.scopeKey, scopeKey)))
        .limit(1);
      if (client) screen.client = client;
    }

    if (Object.keys(screen).length === 0) {
      return "No application state found. Is the app running?";
    }
    return screen;
  },
});
