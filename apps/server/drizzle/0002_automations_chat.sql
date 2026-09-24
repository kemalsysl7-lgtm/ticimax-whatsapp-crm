CREATE TABLE "automations" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"template_name" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"cart_id" integer PRIMARY KEY NOT NULL,
	"member_ticimax_id" integer,
	"cart_updated_at" timestamp with time zone,
	"items" jsonb NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"direction" text NOT NULL,
	"author" text NOT NULL,
	"text" text NOT NULL,
	"wa_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"phone" text PRIMARY KEY NOT NULL,
	"member_ticimax_id" integer,
	"profile_name" text,
	"needs_human" boolean DEFAULT false NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"last_message_at" timestamp with time zone NOT NULL,
	"last_message_preview" text
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "carrier_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_link" text;--> statement-breakpoint
CREATE INDEX "carts_updated_idx" ON "carts" USING btree ("cart_updated_at");--> statement-breakpoint
CREATE INDEX "chat_messages_phone_idx" ON "chat_messages" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "orders_ordered_at_idx" ON "orders" USING btree ("ordered_at");