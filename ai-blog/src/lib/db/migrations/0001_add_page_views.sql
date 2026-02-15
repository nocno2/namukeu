CREATE TABLE `page_views` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `post_id` integer REFERENCES `posts`(`id`) ON DELETE CASCADE,
  `slug` text NOT NULL,
  `referrer` text,
  `user_agent` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_page_views_slug` ON `page_views` (`slug`);
--> statement-breakpoint
CREATE INDEX `idx_page_views_created_at` ON `page_views` (`created_at`);
