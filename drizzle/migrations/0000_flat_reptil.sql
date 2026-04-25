CREATE TABLE `published_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`niche` text NOT NULL,
	`category` text,
	`keyword` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`platform` text NOT NULL,
	`external_post_id` text,
	`external_url` text NOT NULL,
	`published_at` text NOT NULL,
	`scheduled_slot` text,
	`quality_score` integer,
	`metadata` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pp_niche_keyword` ON `published_posts` (`niche`,`keyword`);--> statement-breakpoint
CREATE INDEX `idx_pp_published_at` ON `published_posts` (`published_at`);--> statement-breakpoint
CREATE INDEX `idx_pp_niche_published_at` ON `published_posts` (`niche`,`published_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pp_slug_platform` ON `published_posts` (`slug`,`platform`);