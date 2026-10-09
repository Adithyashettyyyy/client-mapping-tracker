import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { getDb, schema } from "../server/db.js";
import { mappingScope } from "../server/mapping-scope.js";

export default defineAction({
  description:
    "List the current workspace's mapping clients, newest edits first, capped at 500 records.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const db = getDb();
    const { scopeKey } = mappingScope();
    const clients = await db
      .select()
      .from(schema.mappingClients)
      .where(eq(schema.mappingClients.scopeKey, scopeKey))
      .orderBy(desc(schema.mappingClients.updatedAt))
      .limit(500);
    return { clients };
  },
  link: () => ({
    url: buildDeepLink({ view: "clients", to: "/" }),
    label: "Open Mapping Desk clients",
  }),
});
