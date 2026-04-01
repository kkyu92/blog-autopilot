import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { keywords } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getDomesticIssues } from "@/lib/trends";
import { nanoid } from "nanoid";

// GET /api/keywords/naver-trending — 국내 실시간 이슈 키워드 (Zum)
export async function GET() {
  // 캐시 확인 (5분 TTL)
  const [cached] = await db
    .select()
    .from(keywords)
    .where(eq(keywords.keyword, "__domestic_issues_cache__"));

  if (cached?.trendData && cached.cachedAt) {
    const cacheAge = Date.now() - new Date(cached.cachedAt).getTime();
    if (cacheAge < 5 * 60 * 1000) {
      try {
        return NextResponse.json({
          keywords: JSON.parse(cached.trendData),
          cached: true,
          cachedAt: cached.cachedAt,
        });
      } catch {
        // 캐시 파싱 실패
      }
    }
  }

  try {
    const issues = await getDomesticIssues();
    const now = new Date().toISOString();

    if (cached) {
      await db
        .update(keywords)
        .set({ trendData: JSON.stringify(issues), cachedAt: now })
        .where(eq(keywords.keyword, "__domestic_issues_cache__"));
    } else {
      await db.insert(keywords).values({
        id: nanoid(),
        keyword: "__domestic_issues_cache__",
        trendData: JSON.stringify(issues),
        cachedAt: now,
      });
    }

    return NextResponse.json({
      keywords: issues,
      cached: false,
      cachedAt: now,
    });
  } catch (err) {
    if (cached?.trendData) {
      try {
        return NextResponse.json({
          keywords: JSON.parse(cached.trendData),
          cached: true,
          cachedAt: cached.cachedAt,
          stale: true,
        });
      } catch {
        // pass
      }
    }

    return NextResponse.json(
      {
        error: "국내 이슈 조회 실패",
        message: err instanceof Error ? err.message : "Unknown error",
        keywords: [],
      },
      { status: 502 }
    );
  }
}
