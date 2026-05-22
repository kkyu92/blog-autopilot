CREATE TABLE `gsc_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`blog` text NOT NULL,
	`page` text NOT NULL,
	`query` text DEFAULT '' NOT NULL,
	`impressions` integer DEFAULT 0 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`ctr` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`fetched_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_gsc_date_blog_page_query` ON `gsc_metrics` (`date`,`blog`,`page`,`query`);--> statement-breakpoint
CREATE INDEX `idx_gsc_blog_date` ON `gsc_metrics` (`blog`,`date`);--> statement-breakpoint
CREATE INDEX `idx_gsc_blog_query` ON `gsc_metrics` (`blog`,`query`);