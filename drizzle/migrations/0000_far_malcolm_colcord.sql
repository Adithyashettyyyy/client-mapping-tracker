CREATE TABLE "mapping_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"scope_key" text NOT NULL,
	"client_id" text,
	"customer_id" integer NOT NULL,
	"client_name" text NOT NULL,
	"message" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mapping_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"scope_key" text NOT NULL,
	"customer_id" integer NOT NULL,
	"name" text NOT NULL,
	"site_count" integer,
	"country" text DEFAULT 'USA' NOT NULL,
	"na_count" integer,
	"flag10_at" text,
	"price_na_at" text,
	"comp_review_at" text,
	"final_qc_at" text,
	"comments" text DEFAULT '' NOT NULL,
	"poc" text DEFAULT '' NOT NULL,
	"lead_1" text DEFAULT '' NOT NULL,
	"lead_2" text DEFAULT '' NOT NULL,
	"tracking_group" text DEFAULT 'cycle' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mapping_activities_scope_created_at_idx" ON "mapping_activities" USING btree ("scope_key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mapping_clients_scope_customer_id_idx" ON "mapping_clients" USING btree ("scope_key","customer_id");--> statement-breakpoint
CREATE INDEX "mapping_clients_scope_updated_at_idx" ON "mapping_clients" USING btree ("scope_key","updated_at");