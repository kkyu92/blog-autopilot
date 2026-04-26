-- PR5 schema boost
-- Adds: status enum (text), failure_reason, draft_json, UNIQUE(niche, slug)
-- Note: scheduled_slot already exists from PR4 (0000_flat_reptil.sql); not re-added here.
-- Note: status enum is enforced at TypeScript level only — SQLite ALTER ADD COLUMN
--       does not emit a CHECK constraint via drizzle-kit.

ALTER TABLE `published_posts` ADD `status` text DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE `published_posts` ADD `failure_reason` text;--> statement-breakpoint
ALTER TABLE `published_posts` ADD `draft_json` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pp_niche_slug` ON `published_posts` (`niche`,`slug`);
