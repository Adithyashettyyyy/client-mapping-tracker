import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { defineAction, fail } from "@agent-native/core/action";
import { getDb, schema } from "../server/db.js";
import { mappingScope } from "../server/mapping-scope.js";

export default defineAction({
  description: "Remove a mapping client from the current workspace by record UUID.",
  schema: z.object({
    id: z.string().uuid().describe("Mapping client record UUID"),
  }),
  run: async ({ id }) => {
    const db = getDb();
    const scope = mappingScope();
    const now = new Date().toISOString();

    return db.transaction(async (tx) => {
      const [client] = await tx
        .delete(schema.mappingClients)
        .where(
          and(
            eq(schema.mappingClients.id, id),
            eq(schema.mappingClients.scopeKey, scope.scopeKey),
          ),
        )
        .returning();
      if (!client) {
        fail("Client not found in this workspace.", {
          errorCode: "client_not_found",
          statusCode: 404,
        });
      }

      await tx.insert(schema.mappingActivities).values({
        id: crypto.randomUUID(),
        orgId: scope.orgId,
        scopeKey: scope.scopeKey,
        clientId: null,
        customerId: client.customerId,
        clientName: client.name,
        message: "Client removed",
        createdAt: now,
      });
      return { id, deleted: true };
    });
  },
});
