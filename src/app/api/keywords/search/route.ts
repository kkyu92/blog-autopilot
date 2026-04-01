import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { keywords } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getInterestOverTime, getRelatedQueries } from "@/lib/trends";
import { nanoid } from "nanoid";

// GET /api/keywords/search?q=키워드 — 키워드 검색
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json(
      { error: "q parameter is required" },
      { status: 400 }
    );
  }

  // DB 캐시 확인
  const [cached] = await db
    .select()
    .from(keywords)
    .where(eq(keywords.keyword, q));

  if (cached?.trendData && cached.cachedAt) {
    const cacheAge = Date.now() - new Date(cached.cachedAt).getTime();
    if (cacheAge < 24 * 60 * 60 * 1000) {
      // 24시간 캐시
      return NextResponse.json({
        keyword: q,
        ...JSON.parse(cached.trendData),
        relatedKeywords: cached.relatedKeywords
          ? JSON.parse(cached.relatedKeywords)
          : [],
        cached: true,
      });
    }
  }

  try {
    // 1초 딜레이 (rate limit 대비)
    await new Promise((r) => setTimeout(r, 1000));

    const [interest, related] = await Promise.all([
      getInterestOverTime(q).catch(() => []),
      getRelatedQueries(q).catch(() => ({ top: [], rising: [] })),
    ]);

    const now = new Date().toISOString();
    const trendData = JSON.stringify({ interest, related });
    const relatedKeywords = JSON.stringify([
      ...related.top.slice(0, 5),
      ...related.rising.slice(0, 5),
    ]);

    // DB 저장/업데이트
    if (cached) {
      await db
        .update(keywords)
        .set({ trendData, relatedKeywords, cachedAt: now })
        .where(eq(keywords.keyword, q));
    } else {
      await db.insert(keywords).values({
        id: nanoid(),
        keyword: q,
        trendData,
        relatedKeywords,
        cachedAt: now,
      });
    }

    return NextResponse.json({
      keyword: q,
      interest,
      related,
      relatedKeywords: JSON.parse(relatedKeywords),
      cached: false,
    });
  } catch (err) {
    // 실패 시 캐시된 데이터 반환
    if (cached?.trendData) {
      return NextResponse.json({
        keyword: q,
        ...JSON.parse(cached.trendData),
        relatedKeywords: cached.relatedKeywords
          ? JSON.parse(cached.relatedKeywords)
          : [],
        cached: true,
        stale: true,
      });
    }

    return NextResponse.json(
      {
        error: "키워드 검색 실패",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
