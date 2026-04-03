import { NextRequest, NextResponse } from "next/server";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_API_KEY;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;

// POST /api/content/research — 키워드 기반 참고 자료 수집
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { keyword } = body;

  if (!keyword) {
    return NextResponse.json(
      { error: "keyword is required" },
      { status: 400 }
    );
  }

  // Google Custom Search로 상위 5개 결과 검색
  let urls: { url: string; title: string }[] = [];

  if (GOOGLE_CSE_KEY && GOOGLE_CSE_ID) {
    try {
      const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_ID}&q=${encodeURIComponent(keyword)}&num=10&lr=lang_ko`;
      const res = await fetch(searchUrl);
      if (res.ok) {
        const data = await res.json();
        urls = (data.items || []).map(
          (item: { link: string; title: string }) => ({
            url: item.link,
            title: item.title,
          })
        );
      }
    } catch {
      // 검색 실패 시 빈 결과로 진행
    }
  }

  // 각 URL에서 본문 추출
  const results: {
    url: string;
    title: string;
    summary: string;
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
        results.push({ ...item, summary: "", error: `HTTP ${res.status}` });
        continue;
      }

      const html = await res.text();
      const dom = new JSDOM(html, { url: item.url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article?.textContent) {
        // 2000자로 확장 (더 깊은 분석을 위해)
        const summary = article.textContent
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 2000);
        results.push({ url: item.url, title: article.title || item.title, summary });
      } else {
        results.push({ ...item, summary: "", error: "No readable content" });
      }
    } catch (err) {
      results.push({
        ...item,
        summary: "",
        error: err instanceof Error ? err.message : "Fetch failed",
      });
    }
  }

  // 성공한 결과만 요약으로 합침
  const sourceSummaries = results
    .filter((r) => r.summary)
    .map((r) => `[${r.title}]\n${r.summary}`)
    .join("\n\n---\n\n");

  const sourceUrls = results
    .filter((r) => r.summary)
    .map((r) => r.url);

  return NextResponse.json({
    results,
    sourceSummaries,
    sourceUrls,
    searchConfigured: !!(GOOGLE_CSE_KEY && GOOGLE_CSE_ID),
  });
}
