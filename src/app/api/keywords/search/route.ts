import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { keywords } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getRelatedKeywords } from "@/lib/trends";
import { nanoid } from "nanoid";

// GET /api/keywords/search?q=키워드 — 연관 키워드 추천 (Google + Naver)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json(
      { error: "q parameter is required" },
      { status: 400 }
    );
  }

  // DB 캐시 확인 (24시간 TTL)
  const [cached] = await db
    .select()
    .from(keywords)
    .where(eq(keywords.keyword, q));

  if (cached?.relatedKeywords && cached.cachedAt) {
    const cacheAge = Date.now() - new Date(cached.cachedAt).getTime();
    if (cacheAge < 24 * 60 * 60 * 1000) {
      try {
        return NextResponse.json({
          keyword: q,
          ...JSON.parse(cached.relatedKeywords),
          cached: true,
        });
      } catch {
        // 파싱 실패 시 새로 조회
      }
    }
  }

  try {
    const result = await getRelatedKeywords(q);
    const now = new Date().toISOString();
    const relatedJson = JSON.stringify({
      google: result.google,
      naver: result.naver,
    });

    if (cached) {
      await db
        .update(keywords)
        .set({ relatedKeywords: relatedJson, cachedAt: now })
        .where(eq(keywords.keyword, q));
    } else {
      await db.insert(keywords).values({
        id: nanoid(),
        keyword: q,
        relatedKeywords: relatedJson,
        cachedAt: now,
      });
    }

    return NextResponse.json({
      keyword: q,
      google: result.google,
      naver: result.naver,
      cached: false,
    });
  } catch (err) {
    if (cached?.relatedKeywords) {
      try {
        return NextResponse.json({
          keyword: q,
          ...JSON.parse(cached.relatedKeywords),
          cached: true,
          stale: true,
        });
      } catch {
        // pass
      }
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
