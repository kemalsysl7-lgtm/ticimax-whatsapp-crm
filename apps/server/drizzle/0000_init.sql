CREATE TABLE "consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"member_ticimax_id" integer,
	"purpose" text NOT NULL,
	"granted" boolean NOT NULL,
	"source" text NOT NULL,
	"evidence" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_messages" (
	"wa_message_id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"profile_name" text,
	"type" text NOT NULL,
	"text" text,
	"button_text" text,
	"received_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"ticimax_id" integer PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"birth_date" date,
	"sms_permission" boolean NOT NULL,
	"mail_permission" boolean NOT NULL,
	"member_type_id" integer,
	"ticimax_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"dedupe_key" text NOT NULL,
	"phone" text,
	"member_ticimax_id" integer,
	"template_id" integer NOT NULL,
	"category" text NOT NULL,
	"variables" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"skip_reason" text,
	"wa_message_id" text,
	"error_code" integer,
	"error_message" text,
	"pricing_category" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"ticimax_id" integer PRIMARY KEY NOT NULL,
	"member_ticimax_id" integer,
	"status_code" integer NOT NULL,
	"status_name" text NOT NULL,
	"customer_name" text NOT NULL,
	"delivery_phone" text,
	"total" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"ordered_at" timestamp with time zone,
	"cargo_company_id" integer,
	"tracking_no" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"cursor" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"language" text DEFAULT 'tr' NOT NULL,
	"category" text NOT NULL,
	"trigger" text NOT NULL,
	"header_text" text,
	"body" text NOT NULL,
	"footer" text,
	"buttons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"meta_template_id" text,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consents_phone_idx" ON "consents" USING btree ("phone","purpose","created_at");--> statement-breakpoint
CREATE INDEX "inbound_phone_idx" ON "inbound_messages" USING btree ("phone","received_at");--> statement-breakpoint
CREATE INDEX "members_phone_idx" ON "members" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_dedupe_key_uq" ON "messages" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_wa_message_id_uq" ON "messages" USING btree ("wa_message_id");--> statement-breakpoint
CREATE INDEX "messages_phone_sent_idx" ON "messages" USING btree ("phone","category","sent_at");--> statement-breakpoint
CREATE INDEX "orders_member_idx" ON "orders" USING btree ("member_ticimax_id");--> statement-breakpoint
CREATE INDEX "orders_delivery_phone_idx" ON "orders" USING btree ("delivery_phone");