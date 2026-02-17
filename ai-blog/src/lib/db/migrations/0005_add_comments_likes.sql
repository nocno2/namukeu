CREATE TABLE `comments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `post_id` integer NOT NULL REFERENCES `posts`(`id`) ON DELETE CASCADE,
  `parent_id` integer,
  `nickname` text NOT NULL,
  `password_hash` text NOT NULL,
  `content` text NOT NULL,
  `ip_address` text NOT NULL,
  `is_deleted` integer DEFAULT 0 NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_comments_post_id` ON `comments` (`post_id`);
--> statement-breakpoint
CREATE INDEX `idx_comments_created_at` ON `comments` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_comments_ip_address` ON `comments` (`ip_address`);
--> statement-breakpoint
CREATE TABLE `post_likes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `post_id` integer NOT NULL REFERENCES `posts`(`id`) ON DELETE CASCADE,
  `ip_address` text NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_post_likes_post_ip` ON `post_likes` (`post_id`, `ip_address`);
--> statement-breakpoint
CREATE INDEX `idx_post_likes_post_id` ON `post_likes` (`post_id`);
--> statement-breakpoint
CREATE INDEX `idx_post_likes_created_at` ON `post_likes` (`created_at`);
