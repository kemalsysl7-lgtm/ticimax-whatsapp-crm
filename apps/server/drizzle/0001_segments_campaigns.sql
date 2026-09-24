CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"segment" text NOT NULL,
	"template_id" integer NOT NULL,
	"variables" jsonb NOT NULL,
	"audience_size" integer NOT NULL,
	"queued_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_segments" (
	"member_ticimax_id" integer PRIMARY KEY NOT NULL,
	"segment" text NOT NULL,
	"order_count" integer NOT NULL,
	"total_spent" numeric(14, 2) NOT NULL,
	"last_order_at" timestamp with time zone,
	"recency_days" integer,
	"r" integer NOT NULL,
	"f" integer NOT NULL,
	"m" integer NOT NULL,
	"computed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "campaign_id" integer;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_segments_segment_idx" ON "customer_segments" USING btree ("segment");--> statement-breakpoint
CREATE INDEX "messages_member_idx" ON "messages" USING btree ("member_ticimax_id");--> statement-breakpoint
CREATE INDEX "messages_campaign_idx" ON "messages" USING btree ("campaign_id");