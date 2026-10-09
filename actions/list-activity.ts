import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { defineAction } from "@agent-native/core/action";
import { getDb, schema } from "../server/db.js";
import { mappingScope } from "../server/mapping-scope.js";

export default defineAction({
  description:
    "List the 30 most recent client-mapping changes in the current workspace.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const db = getDb();
    const { scopeKey } = mappingScope();
    const activities = await db
      .select()
      .from(schema.mappingActivities)
      .where(eq(schema.mappingActivities.scopeKey, scopeKey))
      .orderBy(desc(schema.mappingActivities.createdAt))
      .limit(30);
    return { activities };
  },
});
