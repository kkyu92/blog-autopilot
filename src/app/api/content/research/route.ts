import { NextRequest, NextResponse } from "next/server";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_API_KEY;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;

// 소스 품질 평가 기준
function evaluateSourceQuality(text: string, title: string): { score: number; reason: string } {
  const len = text.length;

  // 너무 짧은 글 (500자 미만) → 영양가 없음
  if (len < 500) return { score: 0, reason: "too_short" };

  // 광고/스팸 패턴 감지
  const spamPatterns = [
    /클릭\s*하세요/g, /지금\s*바로\s*신청/g, /무료\s*상담/g,
    /할인\s*쿠폰/g, /최저가/g, /▶.*클릭/g, /카톡\s*상담/g,
    /전화\s*문의/g, /업체\s*추천/g, /광고\s*문의/g,
  ];
  const spamCount = spamPatterns.reduce((cnt, pat) => cnt + (text.match(pat)?.length || 0), 0);
  if (spamCount >= 3) return { score: 0, reason: "spam_content" };

  // 목록만 나열한 얕은 글 감지
  const bulletCount = (text.match(/^[-•*]\s/gm) || []).length;
  const paragraphCount = text.split(/\n\n+/).filter(p => p.trim().length > 50).length;
  if (bulletCount > 20 && paragraphCount < 3) return { score: 1, reason: "list_only" };

  // 품질 점수 계산 (0~10)
  let score = 5;

  // 길이 보너스 (1000자 이상부터)
  if (len > 1000) score += 1;
  if (len > 2000) score += 1;
  if (len > 3000) score += 1;

  // 구조화 보너스 (소제목이 있으면)
  const headingCount = (text.match(/^#{1,3}\s/gm) || []).length;
  if (headingCount >= 2) score += 1;

  // 구체적 수치/데이터 보너스
  const numberCount = (text.match(/\d{2,}/g) || []).length;
  if (numberCount >= 3) score += 1;

  // 제목이 구체적인지
  if (title.length > 20) score += 0.5;

  return { score: Math.min(10, score), reason: "quality_assessed" };
}

// POST /api/content/research — 키워드 기반 참고 자료 수집 (품질 필터링 포함)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { keyword } = body;

  if (!keyword) {
    return NextResponse.json(
      { error: "keyword is required" },
      { status: 400 }
    );
  }

  // Google Custom Search로 상위 결과 검색 (10→15개로 확대, 필터링 후 상위 선별)
  let urls: { url: string; title: string; snippet: string }[] = [];

  if (GOOGLE_CSE_KEY && GOOGLE_CSE_ID) {
    try {
      // 1차 검색: 일반 검색
      const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_ID}&q=${encodeURIComponent(keyword)}&num=10&lr=lang_ko`;
      const res = await fetch(searchUrl);
      if (res.ok) {
        const data = await res.json();
        urls = (data.items || []).map(
          (item: { link: string; title: string; snippet?: string }) => ({
            url: item.link,
            title: item.title,
            snippet: item.snippet || "",
          })
        );
      }

      // 2차 검색: "키워드 + 분석/정리/가이드" 추가 (양질 글 타겟팅)
      const deepSearchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_ID}&q=${encodeURIComponent(keyword + " 분석 정리 가이드")}&num=5&lr=lang_ko`;
      const res2 = await fetch(deepSearchUrl);
      if (res2.ok) {
        const data2 = await res2.json();
        const additionalUrls = (data2.items || [])
          .map((item: { link: string; title: string; snippet?: string }) => ({
            url: item.link,
            title: item.title,
            snippet: item.snippet || "",
          }))
          .filter((item: { url: string }) => !urls.some(u => u.url === item.url));
        urls = [...urls, ...additionalUrls];
      }
    } catch {
      // 검색 실패 시 빈 결과로 진행
    }
  }

  // 각 URL에서 본문 추출 + 품질 평가
  const results: {
    url: string;
    title: string;
    summary: string;
    qualityScore: number;
    qualityReason: string;
    wordCount: number;
    error?: string;
  }[] = [];

  for (const item of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(item.url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; ContentAutopilot/1.0; research bot)",
        },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        results.push({
          ...item, summary: "", qualityScore: 0, qualityReason: "fetch_failed",
          wordCount: 0, error: `HTTP ${res.status}`,
        });
        continue;
      }

      const html = await res.text();
      const dom = new JSDOM(html, { url: item.url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article?.textContent) {
        const fullText = article.textContent.replace(/\s+/g, " ").trim();
        const quality = evaluateSourceQuality(fullText, article.title || item.title);

        // 본문 최대 5000자 수집 (기존 2000자에서 확대)
        const summary = fullText.slice(0, 5000);

        results.push({
          url: item.url,
          title: article.title || item.title,
          summary,
          qualityScore: quality.score,
          qualityReason: quality.reason,
          wordCount: fullText.length,
        });
      } else {
        results.push({
          ...item, summary: "", qualityScore: 0, qualityReason: "no_content",
          wordCount: 0, error: "No readable content",
        });
      }
    } catch (err) {
      results.push({
        ...item, summary: "", qualityScore: 0, qualityReason: "error",
        wordCount: 0, error: err instanceof Error ? err.message : "Fetch failed",
      });
    }
  }

  // 품질 점수 기준으로 정렬, 5점 이상만 선별
  const qualityResults = results
    .filter((r) => r.qualityScore >= 5 && r.summary)
    .sort((a, b) => b.qualityScore - a.qualityScore);

  // 상위 5개만 선택 (양질 소스)
  const topResults = qualityResults.slice(0, 5);

  // 필터링 통계
  const stats = {
    totalSearched: urls.length,
    totalFetched: results.filter(r => r.summary).length,
    qualityPassed: qualityResults.length,
    selected: topResults.length,
    filtered: results.filter(r => r.qualityScore < 5).length,
    filterReasons: results
      .filter(r => r.qualityScore < 5)
      .reduce((acc, r) => {
        acc[r.qualityReason] = (acc[r.qualityReason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
  };

  // 양질 소스 요약 합침 (더 많은 본문 포함)
  const sourceSummaries = topResults
    .map((r) => `[${r.title}] (품질: ${r.qualityScore}/10, ${r.wordCount}자)\nURL: ${r.url}\n${r.summary}`)
    .join("\n\n===\n\n");

  const sourceUrls = topResults.map((r) => r.url);

  return NextResponse.json({
    results: topResults,
    allResults: results,
    sourceSummaries,
    sourceUrls,
    stats,
    searchConfigured: !!(GOOGLE_CSE_KEY && GOOGLE_CSE_ID),
  });
}
