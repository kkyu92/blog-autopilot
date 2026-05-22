CREATE TABLE `page_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`blog` text NOT NULL,
	`page_path` text NOT NULL,
	`pageviews` integer DEFAULT 0 NOT NULL,
	`sessions` integer DEFAULT 0 NOT NULL,
	`avg_session_duration_sec` integer DEFAULT 0 NOT NULL,
	`bounce_rate` integer DEFAULT 0 NOT NULL,
	`engagement_rate` integer DEFAULT 0 NOT NULL,
	`fetched_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pm_date_blog_page` ON `page_metrics` (`date`,`blog`,`page_path`);--> statement-breakpoint
CREATE INDEX `idx_pm_blog_date` ON `page_metrics` (`blog`,`date`);