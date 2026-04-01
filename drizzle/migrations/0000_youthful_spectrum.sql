CREATE TABLE `contents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`body_html` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`keyword_id` text,
	`tone` text DEFAULT 'informative',
	`seo_title` text,
	`seo_description` text,
	`seo_tags` text,
	`source_urls` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`keyword_id`) REFERENCES `keywords`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`keyword` text NOT NULL,
	`trend_data` text,
	`related_keywords` text,
	`competition_score` real,
	`search_volume` integer,
	`cached_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `keywords_keyword_unique` ON `keywords` (`keyword`);--> statement-breakpoint
CREATE TABLE `publications` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`platform` text DEFAULT 'blogger' NOT NULL,
	`external_id` text,
	`external_url` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`published_at` text,
	`error_message` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_publications_content` ON `publications` (`content_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
