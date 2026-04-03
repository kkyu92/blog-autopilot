import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { keywords } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getDomesticIssues, type DomesticIssueKeyword } from "@/lib/trends";
import { nanoid } from "nanoid";

// 24시간 누적 키워드를 집계하는 구조
interface DailyAccumulator {
  // keyword → { count: 출현 횟수, lastSeen: 마지막 감지 시간, data: 최신 데이터 }
  entries: Record<string, { count: number; lastSeen: string; data: DomesticIssueKeyword }>;
  lastFetch: string;
  resetAt: string; // 매일 자정에 리셋
}

// GET /api/keywords/naver-trending — 국내 이슈 키워드 (24시간 누적 인기순)
export async function GET() {
  const [cached] = await db
    .select()
    .from(keywords)
    .where(eq(keywords.keyword, "__domestic_daily_cache__"));

  let accumulator: DailyAccumulator;
  const now = new Date();
  const todayReset = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  // 기존 누적 데이터 로드
  if (cached?.trendData) {
    try {
      accumulator = JSON.parse(cached.trendData);
      // 자정이 지났으면 리셋
      if (accumulator.resetAt !== todayReset) {
        accumulator = { entries: {}, lastFetch: "", resetAt: todayReset };
      }
    } catch {
      accumulator = { entries: {}, lastFetch: "", resetAt: todayReset };
    }
  } else {
    accumulator = { entries: {}, lastFetch: "", resetAt: todayReset };
  }

  // 마지막 수집 후 30분 경과했으면 새로 수집 (하루에 최대 48회)
  const lastFetchAge = accumulator.lastFetch
    ? Date.now() - new Date(accumulator.lastFetch).getTime()
    : Infinity;

  if (lastFetchAge > 30 * 60 * 1000) {
    try {
      const issues = await getDomesticIssues();
      accumulator.lastFetch = now.toISOString();

      // 새 키워드를 누적 카운터에 반영
      for (const issue of issues) {
        const key = issue.keyword;
        if (accumulator.entries[key]) {
          accumulator.entries[key].count += 1;
          accumulator.entries[key].lastSeen = now.toISOString();
          accumulator.entries[key].data = issue;
        } else {
          accumulator.entries[key] = {
            count: 1,
            lastSeen: now.toISOString(),
            data: issue,
          };
        }
      }

      // DB에 저장
      const jsonData = JSON.stringify(accumulator);
      if (cached) {
        await db
          .update(keywords)
          .set({ trendData: jsonData, cachedAt: now.toISOString() })
          .where(eq(keywords.keyword, "__domestic_daily_cache__"));
      } else {
        await db.insert(keywords).values({
          id: nanoid(),
          keyword: "__domestic_daily_cache__",
          trendData: jsonData,
          cachedAt: now.toISOString(),
        });
      }
    } catch {
      // 수집 실패 시 기존 데이터 사용
    }
  }

  // 24시간 누적 횟수 기준으로 정렬하여 상위 반환
  const sorted = Object.values(accumulator.entries)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map((entry, i) => ({
      ...entry.data,
      rank: i + 1,
      dailyCount: entry.count,
      lastSeen: entry.lastSeen,
    }));

  return NextResponse.json({
    keywords: sorted,
    cached: lastFetchAge <= 30 * 60 * 1000,
    cachedAt: accumulator.lastFetch,
    mode: "daily_accumulated",
    totalTracked: Object.keys(accumulator.entries).length,
    resetAt: accumulator.resetAt,
  });
}
