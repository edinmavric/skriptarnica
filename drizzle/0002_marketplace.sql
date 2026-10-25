CREATE TYPE "public"."note_language" AS ENUM('sr_latn', 'sr_cyrl', 'en', 'other');--> statement-breakpoint
CREATE TYPE "public"."note_status" AS ENUM('draft', 'processing', 'pending_review', 'published', 'rejected', 'unlisted', 'removed');--> statement-breakpoint
CREATE TYPE "public"."seller_status" AS ENUM('none', 'pending', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('pending', 'consumed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."note_version_status" AS ENUM('uploaded', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('spam', 'abuse', 'plagiarism', 'exam_material', 'personal_data', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."report_target_type" AS ENUM('note', 'review', 'post', 'comment', 'user', 'community');--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_previews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"note_version_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"image_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"blurred" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"note_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"file_key" text NOT NULL,
	"sha256" text,
	"size_bytes" integer NOT NULL,
	"page_count" integer,
	"extracted_text" text,
	"extracted_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce(left(extracted_text, 500000), ''))) STORED,
	"simhash" bigint,
	"status" "note_version_status" DEFAULT 'uploaded' NOT NULL,
	"error_key" text,
	"changelog" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"course_id" uuid,
	"professor_id" uuid,
	"title" text DEFAULT '' NOT NULL,
	"slug" text NOT NULL,
	"short_description" text DEFAULT '' NOT NULL,
	"how_i_studied" text DEFAULT '' NOT NULL,
	"grade" smallint,
	"academic_year" text,
	"exam_period" text,
	"page_count" integer DEFAULT 0 NOT NULL,
	"language" "note_language" DEFAULT 'sr_latn' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"price_para" integer DEFAULT 0 NOT NULL,
	"status" "note_status" DEFAULT 'draft' NOT NULL,
	"rejection_reason" text,
	"moderation_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"declaration_accepted_at" timestamp with time zone,
	"wizard_step" smallint DEFAULT 1 NOT NULL,
	"current_version_id" uuid,
	"published_at" timestamp with time zone,
	"sales_count" integer DEFAULT 0 NOT NULL,
	"rating_sum" integer DEFAULT 0 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "seller_status" DEFAULT 'none' NOT NULL,
	"seller_terms_version" text,
	"seller_terms_accepted_at" timestamp with time zone,
	"payout_holder_enc" text,
	"payout_account_enc" text,
	"payout_account_last4" text,
	"payout_details_updated_at" timestamp with time zone,
	"payout_hold_days" smallint,
	"flagged_at" timestamp with time zone,
	"flag_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"note_id" uuid,
	"object_key" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content_type" text NOT NULL,
	"status" "upload_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reporter_id" uuid,
	"target_type" "report_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"community_id" uuid,
	"reason" "report_reason" NOT NULL,
	"text" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolved_by_id" uuid,
	"resolved_at" timestamp with time zone,
	"action" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_previews" ADD CONSTRAINT "note_previews_note_version_id_note_versions_id_fk" FOREIGN KEY ("note_version_id") REFERENCES "public"."note_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_professor_id_professors_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookmarks_user_note_uq" ON "bookmarks" USING btree ("user_id","note_id");--> statement-breakpoint
CREATE INDEX "bookmarks_note_idx" ON "bookmarks" USING btree ("note_id");--> statement-breakpoint
CREATE UNIQUE INDEX "note_previews_version_page_uq" ON "note_previews" USING btree ("note_version_id","page_number");--> statement-breakpoint
CREATE UNIQUE INDEX "note_versions_note_number_uq" ON "note_versions" USING btree ("note_id","version_number");--> statement-breakpoint
CREATE INDEX "note_versions_sha_idx" ON "note_versions" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "note_versions_status_idx" ON "note_versions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "notes_slug_uq" ON "notes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "notes_seller_idx" ON "notes" USING btree ("seller_id","status");--> statement-breakpoint
CREATE INDEX "notes_course_status_idx" ON "notes" USING btree ("course_id","status","published_at");--> statement-breakpoint
CREATE INDEX "notes_status_idx" ON "notes" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "notes_professor_idx" ON "notes" USING btree ("professor_id");--> statement-breakpoint
CREATE INDEX "notes_search_tsv_idx" ON "notes" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "notes_search_trgm_idx" ON "notes" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "seller_profiles_user_uq" ON "seller_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "seller_profiles_status_idx" ON "seller_profiles" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uploads_key_uq" ON "uploads" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "uploads_user_idx" ON "uploads" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "reports_community_idx" ON "reports" USING btree ("community_id","status");--> statement-breakpoint
-- audit_log is append-only (SPEC §3.6): block UPDATE and DELETE at the database level.
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
