CREATE TABLE `drafts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `keyword` text NOT NULL,
  `topic` text NOT NULL,
  `outline` text,
  `source` text DEFAULT 'trends' NOT NULL,
  `title` text,
  `slug` text,
  `content` text,
  `excerpt` text,
  `category_id` integer,
  `tags` text,
  `review_feedback` text,
  `review_score` integer,
  `revised_content` text,
  `reject_reason` text,
  `status` text DEFAULT 'researched' NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_drafts_status` ON `drafts` (`status`);
