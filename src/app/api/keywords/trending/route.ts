import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { keywords } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getGoogleDailyTrends } from "@/lib/trends";
import { nanoid } from "nanoid";

// GET /api/keywords/trending — Google Trends RSS 실시간 인기 키워드
export async function GET() {
  // 캐시 확인 (5분 TTL)
  const [cached] = await db
    .select()
    .from(keywords)
    .where(eq(keywords.keyword, "__trending_cache__"));

  if (cached?.trendData && cached.cachedAt) {
    const cacheAge = Date.now() - new Date(cached.cachedAt).getTime();
    // Google Trends RSS는 이미 일간 기준이므로 1시간 캐시
    if (cacheAge < 60 * 60 * 1000) {
      try {
        return NextResponse.json({
          keywords: JSON.parse(cached.trendData),
          cached: true,
          cachedAt: cached.cachedAt,
        });
      } catch {
        // 캐시 파싱 실패 시 새로 요청
      }
    }
  }

  try {
    const trends = await getGoogleDailyTrends();
    const now = new Date().toISOString();

    // 캐시 저장
    if (cached) {
      await db
        .update(keywords)
        .set({ trendData: JSON.stringify(trends), cachedAt: now })
        .where(eq(keywords.keyword, "__trending_cache__"));
    } else {
      await db.insert(keywords).values({
        id: nanoid(),
        keyword: "__trending_cache__",
        trendData: JSON.stringify(trends),
        cachedAt: now,
      });
    }

    return NextResponse.json({
      keywords: trends,
      cached: false,
      cachedAt: now,
    });
  } catch (err) {
    // 실패 시 마지막 캐시 데이터 반환
    if (cached?.trendData) {
      try {
        return NextResponse.json({
          keywords: JSON.parse(cached.trendData),
          cached: true,
          cachedAt: cached.cachedAt,
          stale: true,
        });
      } catch {
        // 캐시도 실패
      }
    }

    return NextResponse.json(
      {
        error: "트렌드 조회 실패",
        message: err instanceof Error ? err.message : "Unknown error",
        keywords: [],
      },
      { status: 502 }
    );
  }
}
