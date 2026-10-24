ALTER TABLE "branches" ADD COLUMN "opening_hours" jsonb DEFAULT '{"0":null,"1":["08:00","17:00"],"2":["08:00","17:00"],"3":["08:00","17:00"],"4":["08:00","17:00"],"5":["08:00","17:00"],"6":["08:00","13:00"]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "insurer_shortfall_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "insurer_writeoff_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_by" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_reason" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_provider_ref" text;--> statement-breakpoint
CREATE INDEX "payments_refund_idx" ON "payments" USING btree ("tenant_id","branch_id","refunded_at");--> statement-breakpoint
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_qty_nonnegative" CHECK ("stock_batches"."qty_on_hand" >= 0);