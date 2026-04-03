/**
 * 키워드 리서처 스크립트
 * - Google Trends RSS → 한국 인기 검색어 수집
 * - Zum 실시간 이슈 → 국내 키워드 수집
 * - Google/Naver Suggest → 연관 키워드 확장
 * - 중복 체크 후 DB 저장
 */
import { randomUUID } from "crypto";
import { getDb } from "../src/lib/db";
import { keywords } from "../src/lib/schema";
import {
  getGoogleDailyTrends,
  getDomesticIssues,
  getRelatedKeywords,
  type TrendingKeyword,
  type DomesticIssueKeyword,
} from "../src/lib/trends";

interface CollectedKeyword {
  keyword: string;
  source: "google_trends" | "zum_issues";
  trendData: TrendingKeyword | DomesticIssueKeyword | null;
  relatedGoogle: string[];
  relatedNaver: string[];
}

async function main() {
  console.log("=== 키워드 리서치 시작 ===\n");

  const db = getDb();

  // 1. Google Trends 수집
  console.log("[1/4] Google Trends RSS 수집 중...");
  let googleTrends: TrendingKeyword[] = [];
  try {
    googleTrends = await getGoogleDailyTrends();
    console.log(`  → ${googleTrends.length}개 트렌드 키워드 수집`);
  } catch (e) {
    console.error(`  ✗ Google Trends 수집 실패: ${e}`);
  }

  // 2. Zum 실시간 이슈 수집
  console.log("[2/4] Zum 실시간 이슈 수집 중...");
  let zumIssues: DomesticIssueKeyword[] = [];
  try {
    zumIssues = await getDomesticIssues();
    console.log(`  → ${zumIssues.length}개 국내 이슈 키워드 수집`);
  } catch (e) {
    console.error(`  ✗ Zum 이슈 수집 실패: ${e}`);
  }

  // 모든 키워드 합치기 (중복 제거)
  const allKeywords = new Map<string, { source: "google_trends" | "zum_issues"; data: TrendingKeyword | DomesticIssueKeyword }>();

  for (const t of googleTrends) {
    allKeywords.set(t.keyword, { source: "google_trends", data: t });
  }
  for (const z of zumIssues) {
    if (!allKeywords.has(z.keyword)) {
      allKeywords.set(z.keyword, { source: "zum_issues", data: z });
    }
  }

  console.log(`\n총 ${allKeywords.size}개 고유 키워드 수집됨\n`);

  // 3. DB 중복 체크
  console.log("[3/4] DB 중복 체크 중...");
  const existingRows = db.select({ keyword: keywords.keyword }).from(keywords).all();
  const existingSet = new Set(existingRows.map((r) => r.keyword));

  const newKeywords = [...allKeywords.entries()].filter(([kw]) => !existingSet.has(kw));
  const skipped = allKeywords.size - newKeywords.length;
  console.log(`  → 기존 DB: ${existingSet.size}개, 건너뜀: ${skipped}개, 신규: ${newKeywords.length}개\n`);

  if (newKeywords.length === 0) {
    console.log("신규 키워드 없음. 종료.");
    return;
  }

  // 4. 연관 키워드 확장 + DB 저장
  console.log("[4/4] 연관 키워드 확장 & DB 저장 중...");
  const results: CollectedKeyword[] = [];
  let saved = 0;

  for (const [kw, { source, data }] of newKeywords) {
    process.stdout.write(`  ${kw} ... `);

    let relatedGoogle: string[] = [];
    let relatedNaver: string[] = [];

    try {
      const related = await getRelatedKeywords(kw);
      relatedGoogle = related.google;
      relatedNaver = related.naver;
      console.log(`G:${relatedGoogle.length} N:${relatedNaver.length}`);
    } catch {
      console.log(`연관키워드 실패`);
    }

    // DB 저장
    const allRelated = [...new Set([...relatedGoogle, ...relatedNaver])];
    try {
      db.insert(keywords)
        .values({
          id: randomUUID(),
          keyword: kw,
          trendData: JSON.stringify(data),
          relatedKeywords: JSON.stringify(allRelated),
          cachedAt: new Date().toISOString(),
        })
        .run();
      saved++;
    } catch (e) {
      console.error(`    DB 저장 실패: ${e}`);
    }

    results.push({
      keyword: kw,
      source,
      trendData: data,
      relatedGoogle,
      relatedNaver,
    });

    // Rate limit 방지
    await new Promise((r) => setTimeout(r, 300));
  }

  // 결과 보고
  console.log("\n=== 수집 결과 ===");
  console.log(`Google Trends: ${googleTrends.length}개`);
  console.log(`Zum 이슈: ${zumIssues.length}개`);
  console.log(`고유 키워드: ${allKeywords.size}개`);
  console.log(`DB 기존: ${skipped}개 건너뜀`);
  console.log(`신규 저장: ${saved}개`);
  console.log("\n--- 신규 키워드 목록 ---");
  for (const r of results) {
    const related = [...new Set([...r.relatedGoogle, ...r.relatedNaver])];
    console.log(`  [${r.source}] ${r.keyword} (연관: ${related.length}개)`);
  }
  console.log("\n=== 완료 ===");
}

main().catch((e) => {
  console.error("치명적 오류:", e);
  process.exit(1);
});
