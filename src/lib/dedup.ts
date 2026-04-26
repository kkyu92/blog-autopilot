import { and, eq, gte, like, or, sql } from "drizzle-orm";
import { db } from "./db";
import { publishedPosts, type Niche, type PublishedPost } from "./schema";

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
  platform: string,
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
