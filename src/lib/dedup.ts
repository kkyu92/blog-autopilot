import { and, eq, gte, like, or, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db } from "./db";
import { publishedPosts, type Niche, type Platform, type PublishedPost } from "./schema";

// ── checkAndResolve: 4단계 dedup ─────────────────────────────────────────────

export interface DedupInput {
  niche: "HS" | "TS" | "AS";
  keyword: string;
  evergreen: boolean;
  proposedSlug?: string;
  trend?: {
    search_volume_trend: "급상승" | "상승" | "안정";
    priority_score: number;
  };
}

export type DedupAction = "pass" | "skip" | "follow_up" | "slug_variant";

export interface DedupResult {
  action: DedupAction;
  reason: string;
  recent_post?: PublishedPost;
  suggested_content_type?: string;
  suggested_slug?: string;
}

// BetterSQLite3Database<Record<string, unknown>>: broad enough for the no-schema
// test instance; BetterSQLite3Database<typeof schema> (production) is assignable
// to this type since the class is covariant in TSchema.
type DrizzleDB = BetterSQLite3Database<Record<string, unknown>>;

/** Maximum number of slug variants to attempt before giving up. */
const SLUG_MAX_VARIANT = 10;

const CONTENT_TYPES = ["정보형", "how-to", "비교형", "리스트형", "뉴스형"] as const;

function safeParseJson(raw: string | null | undefined): Record<string, unknown> {
  try {
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * 4-layer dedup check:
 *   L1: slug uniqueness (permanent, same niche)
 *   L4: evergreen keyword — 90d strict (checked before L2/L3 to avoid escaping at 90d boundary)
 *   L2: within 24h — hard skip regardless of trend
 *   L3: within 7d — follow_up if 급상승 + score≥80, else skip
 *   >7d: pass
 */
export async function checkAndResolve(
  dbConn: DrizzleDB,
  input: DedupInput,
): Promise<DedupResult> {
  const { niche, keyword, evergreen, proposedSlug, trend } = input;

  // ── L1: slug 영구 차단 ──────────────────────────────────────────────────
  if (proposedSlug) {
    const slugHit = dbConn
      .select({ id: publishedPosts.id })
      .from(publishedPosts)
      .where(
        and(eq(publishedPosts.niche, niche), eq(publishedPosts.slug, proposedSlug)),
      )
      .get();

    if (slugHit) {
      // Try variants foo-2, foo-3, … foo-10
      let found: string | null = null;
      for (let v = 2; v <= SLUG_MAX_VARIANT; v++) {
        const candidate = `${proposedSlug}-${v}`;
        const variantHit = dbConn
          .select({ id: publishedPosts.id })
          .from(publishedPosts)
          .where(and(eq(publishedPosts.niche, niche), eq(publishedPosts.slug, candidate)))
          .get();
        if (!variantHit) {
          found = candidate;
          break;
        }
      }

      if (!found) {
        return {
          action: "skip",
          reason: `slug "${proposedSlug}" 및 변형 10회 모두 사용 중 — 발행 불가`,
        };
      }

      return {
        action: "slug_variant",
        reason: `slug "${proposedSlug}" 이미 사용 중 — "${found}"으로 변경`,
        suggested_slug: found,
      };
    }
  }

  // ── 최근 게시물 조회 (L2 / L3 / L4 공용) ────────────────────────────────
  const recent: PublishedPost | undefined = dbConn
    .select()
    .from(publishedPosts)
    .where(and(eq(publishedPosts.niche, niche), eq(publishedPosts.keyword, keyword)))
    .orderBy(sql`${publishedPosts.publishedAt} DESC`)
    .limit(1)
    .get();

  if (!recent) {
    return { action: "pass", reason: "신규 키워드 — 게시 이력 없음" };
  }

  const publishedAtMs = new Date(recent.publishedAt).getTime();
  const nowMs = Date.now();
  const elapsedMs = nowMs - publishedAtMs;
  const elapsedDays = elapsedMs / 86_400_000;

  // ── L4: evergreen 90d strict ─────────────────────────────────────────────
  // Only the NEW request's evergreen flag matters — not the old post's metadata.
  if (evergreen && elapsedDays < 90) {
    return {
      action: "skip",
      reason: `evergreen 키워드 — 최근 발행 ${Math.floor(elapsedDays)}일 전 (90d 재발행 금지)`,
      recent_post: recent,
    };
  }

  // ── L2: 24h strict ───────────────────────────────────────────────────────
  if (elapsedMs < 24 * 3600 * 1000) {
    return {
      action: "skip",
      reason: `동일 키워드 24h 이내 발행됨 (${Math.round(elapsedMs / 3_600_000)}h 전)`,
      recent_post: recent,
    };
  }

  // ── L3: 7d loose ─────────────────────────────────────────────────────────
  if (elapsedDays < 7) {
    if (
      trend?.search_volume_trend === "급상승" &&
      trend.priority_score >= 80
    ) {
      const oldType = (safeParseJson(recent.metadata).content_type as string) ?? "정보형";
      const newType = CONTENT_TYPES.find((t) => t !== oldType) ?? "how-to";
      return {
        action: "follow_up",
        reason: `급상승 트렌드 (score=${trend.priority_score}) — 다른 유형의 후속 글 허용`,
        recent_post: recent,
        suggested_content_type: newType,
      };
    }

    return {
      action: "skip",
      reason: `동일 키워드 7d 이내 발행됨 (${Math.floor(elapsedDays)}d 전) — 트렌드 조건 미충족`,
      recent_post: recent,
    };
  }

  // ── >7d: pass ────────────────────────────────────────────────────────────
  return {
    action: "pass",
    reason: `최근 발행 ${Math.floor(elapsedDays)}일 경과 — 재발행 허용`,
    recent_post: recent,
  };
}

interface DedupCheckArgs {
  niche: Niche;
  keyword: string;
  isEvergreen?: boolean;
  windowDaysOverride?: number;
}

export async function isKeywordDuplicate(args: DedupCheckArgs): Promise<{
  isDuplicate: boolean;
  matches: PublishedPost[];
}> {
  const windowDays =
    args.windowDaysOverride ?? (args.isEvergreen ? 90 : 30);

  const cutoff = new Date(Date.now() - windowDays * 86400_000).toISOString();

  const matches = await db
    .select()
    .from(publishedPosts)
    .where(
      and(
        eq(publishedPosts.niche, args.niche),
        gte(publishedPosts.publishedAt, cutoff),
        or(
          eq(publishedPosts.keyword, args.keyword),
          like(publishedPosts.keyword, `%${args.keyword}%`),
          sql`${args.keyword} LIKE '%' || ${publishedPosts.keyword} || '%'`,
        ),
      ),
    );

  return { isDuplicate: matches.length > 0, matches };
}

export async function getCategoryDistribution(niche: Niche) {
  const cutoff = new Date(Date.now() - 3 * 86400_000).toISOString();

  return db
    .select({
      category: publishedPosts.category,
      count: sql<number>`count(*)`,
    })
    .from(publishedPosts)
    .where(
      and(
        eq(publishedPosts.niche, niche),
        gte(publishedPosts.publishedAt, cutoff),
      ),
    )
    .groupBy(publishedPosts.category);
}

export async function getOccupiedSlots(
  platform: Platform,
  date: string,
): Promise<string[]> {
  const dayStart = `${date}T00:00:00+09:00`;
  const dayEnd = `${date}T23:59:59+09:00`;

  const rows = await db
    .select({ slot: publishedPosts.scheduledSlot })
    .from(publishedPosts)
    .where(
      and(
        eq(publishedPosts.platform, platform),
        gte(publishedPosts.publishedAt, dayStart),
        sql`${publishedPosts.publishedAt} <= ${dayEnd}`,
      ),
    );

  return rows.map((r) => r.slot).filter((s): s is string => s !== null);
}
