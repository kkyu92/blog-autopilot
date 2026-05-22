import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const publishedPosts = sqliteTable(
  "published_posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    niche: text("niche", { enum: ["HS", "TS", "AS"] }).notNull(),
    category: text("category"),
    keyword: text("keyword").notNull(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    platform: text("platform", {
      enum: [
        "wordpress_ws",
        "wordpress_ts",
        "blogger_as",
        "blogger_trip",
        "blogger_health",
      ],
    }).notNull(),
    externalPostId: text("external_post_id"),
    externalUrl: text("external_url").notNull(),
    publishedAt: text("published_at").notNull(),
    scheduledSlot: text("scheduled_slot"),
    qualityScore: integer("quality_score"),
    metadata: text("metadata"),
    status: text("status", { enum: ["published", "failed"] })
      .notNull()
      .default("published"),
    failureReason: text("failure_reason"),
    draftJson: text("draft_json"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_pp_niche_keyword").on(table.niche, table.keyword),
    index("idx_pp_published_at").on(table.publishedAt),
    index("idx_pp_niche_published_at").on(table.niche, table.publishedAt),
    uniqueIndex("idx_pp_slug_platform").on(table.slug, table.platform),
    uniqueIndex("idx_pp_niche_slug").on(table.niche, table.slug),
  ],
);

export type PublishedPost = typeof publishedPosts.$inferSelect;
export type NewPublishedPost = typeof publishedPosts.$inferInsert;

// GSC daily metrics — 매일 어제 데이터 누적. 검색 쿼리/페이지 별 metrics.
// 무한 성장 monetization closed loop Phase 2 (docs/roadmap-gsc-analytics.md).
// ctr / position 은 integer 저장 (×10000 / ×100) — drizzle sqlite-core real 미지원, float precision 보존.
export const gscMetrics = sqliteTable(
  "gsc_metrics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(), // YYYY-MM-DD (KST)
    blog: text("blog", { enum: ["AS", "HS", "TS"] }).notNull(),
    page: text("page").notNull(), // 페이지 URL (path only, 정규화)
    query: text("query").notNull().default(""), // 검색 쿼리 ("" = page 합계)
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    ctr: integer("ctr").notNull().default(0), // ×10000 (예: 5.23% = 523)
    position: integer("position").notNull().default(0), // ×100 (예: 6.18 = 618)
    fetchedAt: text("fetched_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("idx_gsc_date_blog_page_query").on(
      table.date,
      table.blog,
      table.page,
      table.query,
    ),
    index("idx_gsc_blog_date").on(table.blog, table.date),
    index("idx_gsc_blog_query").on(table.blog, table.query),
  ],
);

export type GscMetric = typeof gscMetrics.$inferSelect;
export type NewGscMetric = typeof gscMetrics.$inferInsert;

// GA4 daily page metrics — pageviews/세션/체류시간/이탈률 누적.
// Phase 3 (monetization closed loop — docs/roadmap-gsc-analytics.md).
// avg_session_duration_sec / bounce_rate / engagement_rate 는 integer 저장 (×100 / ×10000 / ×10000).
export const pageMetrics = sqliteTable(
  "page_metrics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(), // YYYY-MM-DD (KST)
    blog: text("blog", { enum: ["AS", "HS", "TS"] }).notNull(),
    pagePath: text("page_path").notNull(), // 정규화 path
    pageviews: integer("pageviews").notNull().default(0),
    sessions: integer("sessions").notNull().default(0),
    avgSessionDurationSec: integer("avg_session_duration_sec").notNull().default(0), // ×100 (예: 12.34초 = 1234)
    bounceRate: integer("bounce_rate").notNull().default(0), // ×10000 (예: 65.23% = 6523)
    engagementRate: integer("engagement_rate").notNull().default(0), // ×10000
    fetchedAt: text("fetched_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("idx_pm_date_blog_page").on(
      table.date,
      table.blog,
      table.pagePath,
    ),
    index("idx_pm_blog_date").on(table.blog, table.date),
  ],
);

export type PageMetric = typeof pageMetrics.$inferSelect;
export type NewPageMetric = typeof pageMetrics.$inferInsert;

export type Niche = "HS" | "TS" | "AS";
export type Platform =
  | "wordpress_ws"
  | "wordpress_ts"
  | "blogger_as"
  | "blogger_trip"
  | "blogger_health";

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
