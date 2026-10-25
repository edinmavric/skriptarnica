CREATE TYPE "public"."copyright_claim_status" AS ENUM('open', 'accepted', 'rejected', 'countered');--> statement-breakpoint
CREATE TABLE "copyright_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"claimant_name" text NOT NULL,
	"claimant_email" text NOT NULL,
	"organization" text,
	"ownership_proof" text NOT NULL,
	"content_url" text NOT NULL,
	"note_id" uuid,
	"statement_accepted_at" timestamp with time zone NOT NULL,
	"status" "copyright_claim_status" DEFAULT 'open' NOT NULL,
	"counter_notice" text,
	"counter_notice_at" timestamp with time zone,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "copyright_claims" ADD CONSTRAINT "copyright_claims_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "copyright_claims_status_idx" ON "copyright_claims" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "copyright_claims_note_idx" ON "copyright_claims" USING btree ("note_id");