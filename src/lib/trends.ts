// Google Trends RSS + Naver Suggest 기반 트렌드 + 연관 키워드

// ── Google 트렌드 ──

export interface TrendingKeyword {
  keyword: string;
  trafficVolume: string;
  newsTitle: string;
  newsSource: string;
  newsUrl: string;
  imageUrl: string;
  pubDate: string;
}

export async function getGoogleDailyTrends(): Promise<TrendingKeyword[]> {
  const res = await fetch("https://trends.google.co.kr/trending/rss?geo=KR", {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Google Trends RSS failed: ${res.status}`);
  const xml = await res.text();
  return parseRssItems(xml);
}

function parseRssItems(xml: string): TrendingKeyword[] {
  const items: TrendingKeyword[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const traffic = extractTag(block, "ht:approx_traffic");
    const pubDate = extractTag(block, "pubDate");
    const picture = extractTag(block, "ht:picture");

    const newsItemMatch = /<ht:news_item>([\s\S]*?)<\/ht:news_item>/.exec(block);
    let newsTitle = "";
    let newsSource = "";
    let newsUrl = "";
    if (newsItemMatch) {
      newsTitle = extractTag(newsItemMatch[1], "ht:news_item_title");
      newsSource = extractTag(newsItemMatch[1], "ht:news_item_source");
      newsUrl = extractTag(newsItemMatch[1], "ht:news_item_url");
    }

    if (title) {
      items.push({
        keyword: decodeHtmlEntities(title),
        trafficVolume: traffic || "",
        newsTitle: decodeHtmlEntities(newsTitle),
        newsSource,
        newsUrl,
        imageUrl: picture || "",
        pubDate: pubDate || "",
      });
    }
  }

  return items;
}

// ── 국내 이슈 키워드 (Zum 실시간 이슈) ──

export interface DomesticIssueKeyword {
  keyword: string;
  rank: number;
  summary: string;
  question: string;
  newsTitle: string;
  newsUrl: string;
}

export async function getDomesticIssues(): Promise<DomesticIssueKeyword[]> {
  const res = await fetch("https://zum.com/", {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Zum fetch failed: ${res.status}`);
  const html = await res.text();

  const regex = /\{"keyword":"([^"]+)"[^}]*?"data":"([^"]*)"[^}]*?"questions":"([^"]*)"[^}]*?"news":\[\{"title":"([^"]*)"[^}]*?"originalUrl":"([^"]*)"/g;
  const results: DomesticIssueKeyword[] = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    results.push({
      keyword: match[1],
      rank: results.length + 1,
      summary: decodeUnicodeEscapes(match[2]),
      question: match[3],
      newsTitle: decodeUnicodeEscapes(match[4]),
      newsUrl: decodeUnicodeEscapes(match[5]),
    });
  }

  return results;
}

function decodeUnicodeEscapes(str: string): string {
  return str.replace(/\\u002F/g, "/").replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

// ── 연관 키워드 추천 (Google + Naver 동시 조회) ──

export interface RelatedKeywordResult {
  keyword: string;
  google: string[];
  naver: string[];
}

export async function getRelatedKeywords(
  keyword: string
): Promise<RelatedKeywordResult> {
  const [google, naver] = await Promise.allSettled([
    getGoogleSuggest(keyword),
    getNaverSuggest(keyword),
  ]);

  return {
    keyword,
    google: google.status === "fulfilled" ? google.value : [],
    naver: naver.status === "fulfilled" ? naver.value : [],
  };
}

// ── Suggest APIs ──

async function getGoogleSuggest(keyword: string): Promise<string[]> {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&q=${encodeURIComponent(keyword)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) throw new Error(`Google Suggest failed: ${res.status}`);
  const data = await res.json();

  return (data[1] || [])
    .filter((s: string) => s.toLowerCase() !== keyword.toLowerCase())
    .slice(0, 10);
}

export async function getNaverSuggest(keyword: string): Promise<string[]> {
  const url = `https://mac.search.naver.com/mobile/ac?q=${encodeURIComponent(keyword)}&st=100&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&q_enc=UTF-8`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)" },
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) throw new Error(`Naver Suggest failed: ${res.status}`);
  const data = await res.json();

  // 응답: { query: [...], items: [[[kw1],[kw2],...]] }
  const items = data?.items?.[0] || [];
  return items
    .map((item: string[]) => item[0])
    .filter((s: string) => s.toLowerCase() !== keyword.toLowerCase())
    .slice(0, 10);
}

// ── Utils ──

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const match = regex.exec(xml);
  return match ? match[1].trim() : "";
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}
