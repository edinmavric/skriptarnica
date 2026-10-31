ALTER TYPE "public"."program_level" ADD VALUE 'ias';--> statement-breakpoint
ALTER TYPE "public"."community_type" ADD VALUE 'university' BEFORE 'faculty';--> statement-breakpoint
ALTER TYPE "public"."community_type" ADD VALUE 'program' BEFORE 'course';--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "university_id" uuid;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "program_id" uuid;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."universities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_program_id_study_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."study_programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "communities_university_auto_uq" ON "communities" USING btree ("university_id") WHERE university_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "communities_program_auto_uq" ON "communities" USING btree ("program_id") WHERE program_id IS NOT NULL;