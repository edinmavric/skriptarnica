CREATE TYPE "public"."exam_period_key" AS ENUM('januarski', 'februarski', 'aprilski', 'junski', 'julski', 'avgustovski', 'septembarski', 'oktobarski', 'oktobarski2', 'decembarski');--> statement-breakpoint
CREATE TABLE "exam_periods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"course_id" uuid NOT NULL,
	"academic_year" text NOT NULL,
	"period" "exam_period_key" NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_course_status" ADD COLUMN "professor_id" uuid;--> statement-breakpoint
ALTER TABLE "exam_periods" ADD CONSTRAINT "exam_periods_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_periods" ADD CONSTRAINT "exam_periods_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_periods_course_year_period_uq" ON "exam_periods" USING btree ("course_id","academic_year","period");--> statement-breakpoint
CREATE INDEX "exam_periods_starts_idx" ON "exam_periods" USING btree ("starts_on");--> statement-breakpoint
ALTER TABLE "user_course_status" ADD CONSTRAINT "user_course_status_professor_id_professors_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professors"("id") ON DELETE set null ON UPDATE no action;