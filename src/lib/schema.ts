import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const keywords = sqliteTable("keywords", {
  id: text("id").primaryKey(),
  keyword: text("keyword").notNull().unique(),
  trendData: text("trend_data"), // JSON string
  relatedKeywords: text("related_keywords"), // JSON array string
  competitionScore: real("competition_score"),
  searchVolume: integer("search_volume"),
  cachedAt: text("cached_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const contents = sqliteTable("contents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  bodyHtml: text("body_html"),
  status: text("status", { enum: ["draft", "published", "failed"] })
    .notNull()
    .default("draft"),
  keywordId: text("keyword_id").references(() => keywords.id),
  tone: text("tone", { enum: ["informative", "conversational", "expert"] }).default(
    "informative"
  ),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  seoTags: text("seo_tags"), // JSON array string
  sourceUrls: text("source_urls"), // JSON array string
  scheduledAt: text("scheduled_at"), // ISO 8601 — 예약 발행 시간
  scheduledPlatform: text("scheduled_platform"), // blogger | naver
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const publications = sqliteTable(
  "publications",
  {
    id: text("id").primaryKey(),
    contentId: text("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    platform: text("platform").notNull().default("blogger"),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    status: text("status", { enum: ["pending", "published", "failed"] })
      .notNull()
      .default("pending"),
    publishedAt: text("published_at"),
    errorMessage: text("error_message"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index("idx_publications_content").on(table.contentId)]
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
