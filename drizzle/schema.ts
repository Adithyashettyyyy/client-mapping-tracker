import { index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

export const mappingClients = pgTable(
  "mapping_clients",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id"),
    scopeKey: text("scope_key").notNull(),
    customerId: integer("customer_id").notNull(),
    name: text("name").notNull(),
    siteCount: integer("site_count"),
    country: text("country").notNull().default("USA"),
    naCount: integer("na_count"),
    flag10At: text("flag10_at"),
    priceNaAt: text("price_na_at"),
    compReviewAt: text("comp_review_at"),
    finalQcAt: text("final_qc_at"),
    comments: text("comments").notNull().default(""),
    poc: text("poc").notNull().default(""),
    lead1: text("lead_1").notNull().default(""),
    lead2: text("lead_2").notNull().default(""),
    trackingGroup: text("tracking_group").notNull().default("cycle"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("mapping_clients_scope_customer_id_idx").on(
      table.scopeKey,
      table.customerId,
    ),
    index("mapping_clients_scope_updated_at_idx").on(
      table.scopeKey,
      table.updatedAt,
    ),
  ],
);

export const mappingActivities = pgTable(
  "mapping_activities",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id"),
    scopeKey: text("scope_key").notNull(),
    clientId: text("client_id"),
    customerId: integer("customer_id").notNull(),
    clientName: text("client_name").notNull(),
    message: text("message").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("mapping_activities_scope_created_at_idx").on(
      table.scopeKey,
      table.createdAt,
    ),
  ],
);
