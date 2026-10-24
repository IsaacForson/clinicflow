CREATE TABLE "fx_rates" (
	"currency" text PRIMARY KEY NOT NULL,
	"per_usd" double precision NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'default' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_book" (
	"currency" text PRIMARY KEY NOT NULL,
	"solo" integer NOT NULL,
	"clinic" integer NOT NULL,
	"group" integer NOT NULL,
	"scribe" integer NOT NULL,
	"migration_basic" integer NOT NULL,
	"migration_standard" integer NOT NULL,
	"migration_full" integer NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "currency" text;