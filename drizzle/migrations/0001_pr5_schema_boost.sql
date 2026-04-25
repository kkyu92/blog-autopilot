ALTER TABLE `published_posts` ADD `status` text DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE `published_posts` ADD `failure_reason` text;--> statement-breakpoint
ALTER TABLE `published_posts` ADD `draft_json` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pp_niche_slug` ON `published_posts` (`niche`,`slug`);