import { buildDeepLink } from "@agent-native/core/server";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { defineAction, fail } from "@agent-native/core/action";
import { getDb, schema } from "../server/db.js";
import { mappingScope } from "../server/mapping-scope.js";

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Use a valid calendar date.")
  .nullable();

export default defineAction({
  description:
    "Update a mapping client by record id. Supply only fields to change; nullable counts and dates can be cleared with null.",
  schema: z.object({
    id: z.string().uuid().describe("Mapping client record UUID"),
    customerId: z.coerce.number().int().positive().optional().describe("Positive customer ID"),
    name: z.string().trim().min(1).max(200).optional().describe("Client name, up to 200 characters"),
    siteCount: z.coerce.number().int().min(0).nullable().optional().describe("Site count or null when unknown"),
    country: z.string().trim().min(1).max(80).optional().describe("Country name"),
    naCount: z.coerce.number().int().min(0).nullable().optional().describe("Count of N/A sites or null when unknown"),
    flag10At: dateField.optional().describe("Flag 10 review date as YYYY-MM-DD, or null"),
    priceNaAt: dateField.optional().describe("Price N/A review date as YYYY-MM-DD, or null"),
    compReviewAt: dateField.optional().describe("Competitor review date as YYYY-MM-DD, or null"),
    finalQcAt: dateField.optional().describe("Final QC date as YYYY-MM-DD, or null"),
    comments: z.string().max(4000).optional().describe("Client mapping notes, up to 4000 characters"),
    poc: z.string().max(120).optional().describe("Person of contact label, or an empty string"),
    lead1: z.string().max(120).optional().describe("First mapping lead, or an empty string"),
    lead2: z.string().max(120).optional().describe("Second mapping lead, or an empty string"),
    trackingGroup: z.enum(["cycle", "await", "nomap"]).optional().describe("Tracking state: cycle, await, or nomap"),
  }),
  run: async ({ id, ...input }) => {
    const db = getDb();
    const scope = mappingScope();
    const now = new Date().toISOString();

    return db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(schema.mappingClients)
        .where(
          and(
            eq(schema.mappingClients.id, id),
            eq(schema.mappingClients.scopeKey, scope.scopeKey),
          ),
        )
        .limit(1);
      if (!current) {
        fail("Client not found in this workspace.", {
          errorCode: "client_not_found",
          statusCode: 404,
        });
      }

      if (input.customerId !== undefined) {
        const duplicate = await tx
          .select({ id: schema.mappingClients.id })
          .from(schema.mappingClients)
          .where(
            and(
              eq(schema.mappingClients.scopeKey, scope.scopeKey),
              eq(schema.mappingClients.customerId, input.customerId),
              ne(schema.mappingClients.id, id),
            ),
          )
          .limit(1);
        if (duplicate.length) {
          fail("That customer ID is already in the tracker.", {
            errorCode: "duplicate_customer_id",
            statusCode: 409,
          });
        }
      }

      const [client] = await tx
        .update(schema.mappingClients)
        .set({ ...input, updatedAt: now })
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
        clientId: id,
        customerId: client.customerId,
        clientName: client.name,
        message: "Client details updated",
        createdAt: now,
      });
      return client;
    });
  },
  link: ({ result }) => ({
    url: buildDeepLink({
      view: "clients",
      params: { clientId: result.id },
      to: "/",
    }),
    label: "Open client in Mapping Desk",
  }),
});
