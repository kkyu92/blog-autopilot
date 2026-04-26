import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const publishedPosts = sqliteTable(
  "published_posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    niche: text("niche", { enum: ["WS", "TS", "AS"] }).notNull(),
    category: text("category"),
    keyword: text("keyword").notNull(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    platform: text("platform", {
      enum: ["wordpress_ws", "wordpress_ts", "blogger_as"],
    }).notNull(),
    externalPostId: text("external_post_id"),
    externalUrl: text("external_url").notNull(),
    publishedAt: text("published_at").notNull(),
    scheduledSlot: text("scheduled_slot"),
    qualityScore: integer("quality_score"),
    metadata: text("metadata"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_pp_niche_keyword").on(table.niche, table.keyword),
    index("idx_pp_published_at").on(table.publishedAt),
    index("idx_pp_niche_published_at").on(table.niche, table.publishedAt),
    uniqueIndex("idx_pp_slug_platform").on(table.slug, table.platform),
  ],
);

export type PublishedPost = typeof publishedPosts.$inferSelect;
export type NewPublishedPost = typeof publishedPosts.$inferInsert;

export type Niche = "WS" | "TS" | "AS";
export type Platform = "wordpress_ws" | "wordpress_ts" | "blogger_as";

export interface PostMetadata {
  priority_score?: number;
  content_type?: "정보형" | "how-to" | "비교형" | "리스트형" | "뉴스형";
  image_count?: number;
  chart_count?: number;
  word_count?: number;
  evergreen?: boolean;
  ymyl?: boolean;
  trend_source?: "google_trends_kr" | "naver" | "sns" | "manual" | "seasonal";
  seasonal_boost?: string | null;
  policy_change_exception?: boolean;
}
