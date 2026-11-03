CREATE INDEX "orders_paid_idx" ON "orders" USING btree ("status","paid_at");--> statement-breakpoint
CREATE INDEX "communities_professor_idx" ON "communities" USING btree ("professor_id");--> statement-breakpoint
CREATE INDEX "communities_popular_idx" ON "communities" USING btree ("visibility","member_count");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id") WHERE read_at IS NULL;