import { buildDeepLink } from "@agent-native/core/server";
import { and, eq } from "drizzle-orm";
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
    "Create a client record in the current workspace's mapping tracker and return its generated id.",
  schema: z.object({
    customerId: z.coerce.number().int().positive().describe("Positive customer ID"),
    name: z.string().trim().min(1).max(200).describe("Client name, up to 200 characters"),
    siteCount: z.coerce.number().int().min(0).nullable().describe("Site count or null when unknown"),
    country: z.string().trim().min(1).max(80).describe("Country name"),
    naCount: z.coerce.number().int().min(0).nullable().describe("Count of N/A sites or null when unknown"),
    flag10At: dateField.describe("Flag 10 review date as YYYY-MM-DD, or null"),
    priceNaAt: dateField.describe("Price N/A review date as YYYY-MM-DD, or null"),
    compReviewAt: dateField.describe("Competitor review date as YYYY-MM-DD, or null"),
    finalQcAt: dateField.describe("Final QC date as YYYY-MM-DD, or null"),
    comments: z.string().max(4000).describe("Client mapping notes, up to 4000 characters"),
    poc: z.string().max(120).describe("Person of contact label, or an empty string"),
    lead1: z.string().max(120).describe("First mapping lead, or an empty string"),
    lead2: z.string().max(120).describe("Second mapping lead, or an empty string"),
    trackingGroup: z.enum(["cycle", "await", "nomap"]).describe("Tracking state: cycle, await, or nomap"),
  }),
  run: async (input) => {
    const db = getDb();
    const scope = mappingScope();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    return db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: schema.mappingClients.id })
        .from(schema.mappingClients)
        .where(
          and(
            eq(schema.mappingClients.scopeKey, scope.scopeKey),
            eq(schema.mappingClients.customerId, input.customerId),
          ),
        )
        .limit(1);
      if (existing.length) {
        fail("That customer ID is already in the tracker.", {
          errorCode: "duplicate_customer_id",
          statusCode: 409,
        });
      }

      const [client] = await tx
        .insert(schema.mappingClients)
        .values({
          ...input,
          id,
          orgId: scope.orgId,
          scopeKey: scope.scopeKey,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!client) throw new Error("Client insert returned no row.");

      await tx.insert(schema.mappingActivities).values({
        id: crypto.randomUUID(),
        orgId: scope.orgId,
        scopeKey: scope.scopeKey,
        clientId: id,
        customerId: client.customerId,
        clientName: client.name,
        message: "Client added",
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
