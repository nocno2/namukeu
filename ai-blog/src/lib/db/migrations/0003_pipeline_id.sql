ALTER TABLE `drafts` ADD COLUMN `pipeline_id` text;
--> statement-breakpoint
ALTER TABLE `drafts` ADD COLUMN `notified_at` text;
--> statement-breakpoint
CREATE INDEX `idx_drafts_pipeline` ON `drafts` (`pipeline_id`);
