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

export function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const match = regex.exec(xml);
  return match ? match[1].trim() : "";
}

export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

// ── LLM 기반 키워드 큐 (pickQueue) ──

import { callClaude } from './llm';
import { aggregateAsSignals, type RealEstateSignal } from './realestate-news';
import { aggregateWsSignals, type WellnessSignal } from './wellness-news';
import { aggregateTsSignals, type TravelSignal } from './travel-news';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __filename_trends = fileURLToPath(import.meta.url);
const __dirname_trends = path.dirname(__filename_trends);
const TREND_HUNTER_PROMPT = fs.readFileSync(
  path.resolve(__dirname_trends, '../../prompts/agents/trend-hunter.md'),
  'utf-8'
);

export interface KeywordCandidate {
  keyword: string;
  category: string;
  content_type: '정보형' | 'how-to' | '비교형' | '리스트형' | '뉴스형';
  search_volume_trend: '급상승' | '상승' | '안정';
  priority_score: number;
  evergreen: boolean;
  image_keywords: string[];
}

export interface PickQueueOptions {
  niche: 'HS' | 'TS' | 'AS';
  count?: number;
  /** Optional pre-fetched signals to feed LLM. If omitted, fetches Google daily trends + niche-specific aggregator. */
  signals?: {
    daily_trends?: TrendingKeyword[];
    related?: RelatedKeywordResult[];
    /** AS niche — 5-source real estate signals. Auto-fetched if omitted. */
    realestate?: RealEstateSignal[];
    /** WS niche — 5-source wellness/health signals. Auto-fetched if omitted. */
    wellness?: WellnessSignal[];
    /** TS niche — 5-source travel signals. Auto-fetched if omitted. */
    travel?: TravelSignal[];
  };
  /**
   * paperclip 시절 trend-hunter agent는 자체 메모리로 이전 발행 키워드를 추적해 cannibalization 사전 차단.
   * stateless LLM call에서는 호출자가 최근 발행 키워드를 명시 inject 해서 동일 효과 복원.
   * agent 출력 단계에서 1차 차단 → semantic-dedup layer는 backup. 4/28 사고 (28/29 sub-angle 변형 통과)
   * 처럼 layer 사이에서 새는 케이스 사전 방지.
   */
  recent_published_keywords?: string[];
}

// Niche definition yaml은 trend-hunter persona에 niche-specific 카테고리 가이드를 inject하기 위해 사용.
// paperclip 시절은 SHARED_RULES.md + AGENTS.md 인프라가 자동 로드했지만 우리 lib은 독립이라 명시 inject.
const NICHE_YAML_FILES: Record<'HS' | 'TS' | 'AS', string> = {
  HS: 'worldsignal.yaml',
  TS: 'travelsignal.yaml',
  AS: 'aptsignal.yaml',
};

function loadNicheYaml(niche: 'HS' | 'TS' | 'AS'): string {
  const filePath = path.resolve(__dirname_trends, '../../niches', NICHE_YAML_FILES[niche]);
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

export async function pickQueue(opts: PickQueueOptions): Promise<KeywordCandidate[]> {
  const count = opts.count ?? 5;

  // Gather raw signals (with graceful fallback if external sources fail)
  let dailyTrends: TrendingKeyword[] = opts.signals?.daily_trends ?? [];
  if (!opts.signals?.daily_trends) {
    try { dailyTrends = await getGoogleDailyTrends(); } catch { dailyTrends = []; }
  }

  // niche-specific 5-source aggregators (paperclip stateful agent 가 자체 fetch했던 다양 source를
  // stateless LLM call에 input으로 공급. 4/28 WS×1 dispatch 큐 풀 부족 사고 근본해결).
  // 9 카테고리 균형 분포 + 시장/정책/시즌 fresh 신호 공급.
  let realestate: RealEstateSignal[] = opts.signals?.realestate ?? [];
  if (opts.niche === 'AS' && !opts.signals?.realestate) {
    try {
      realestate = await aggregateAsSignals({ windowHours: 72, maxItems: 60 });
    } catch (err) {
      console.warn(`[trends] aggregateAsSignals failed (continuing): ${(err as Error).message}`);
      realestate = [];
    }
  }

  let wellness: WellnessSignal[] = opts.signals?.wellness ?? [];
  if (opts.niche === 'HS' && !opts.signals?.wellness) {
    try {
      wellness = await aggregateWsSignals({ windowHours: 72, maxItems: 60 });
    } catch (err) {
      console.warn(`[trends] aggregateWsSignals failed (continuing): ${(err as Error).message}`);
      wellness = [];
    }
  }

  let travel: TravelSignal[] = opts.signals?.travel ?? [];
  if (opts.niche === 'TS' && !opts.signals?.travel) {
    try {
      travel = await aggregateTsSignals({ windowHours: 72, maxItems: 60 });
    } catch (err) {
      console.warn(`[trends] aggregateTsSignals failed (continuing): ${(err as Error).message}`);
      travel = [];
    }
  }

  const recentKeywords = opts.recent_published_keywords ?? [];

  const userMessage = JSON.stringify({
    niche: opts.niche,
    count,
    niche_definition_yaml: loadNicheYaml(opts.niche),
    daily_trends_kr: dailyTrends.slice(0, 20).map(t => ({ keyword: t.keyword, traffic: t.trafficVolume })),
    ...(opts.niche === 'AS' && realestate.length > 0
      ? {
          realestate_news: realestate.map((s) => ({
            title: s.title,
            source: s.source,
            pubDate: s.pubDate,
          })),
        }
      : {}),
    ...(opts.niche === 'HS' && wellness.length > 0
      ? {
          wellness_news: wellness.map((s) => ({
            title: s.title,
            source: s.source,
            pubDate: s.pubDate,
          })),
        }
      : {}),
    ...(opts.niche === 'TS' && travel.length > 0
      ? {
          travel_news: travel.map((s) => ({
            title: s.title,
            source: s.source,
            pubDate: s.pubDate,
          })),
        }
      : {}),
    ...(recentKeywords.length > 0 ? { recent_published_keywords: recentKeywords } : {}),
    instruction:
      'CRITICAL: niche_definition_yaml에 정의된 categories 중 하나에 속하는 키워드만 선택하라. ' +
      '예: WS=건강/의료(질환·증상·영양·운동·의약품·정신건강·예방·가족건강·라이프스타일), ' +
      'TS=여행/레저(국내·해외·숙소·항공·액티비티·여행팁·맛집·여행정보), ' +
      'AS=부동산/청약(청약·매매전세월세·정책·세금·인테리어·생활). ' +
      'daily_trends_kr 항목 중 niche 카테고리에 안 맞는 키워드(예: 스포츠·연예인·정치·해외주식)는 절대 포함하지 마라. ' +
      (opts.niche === 'AS' && realestate.length > 0
        ? 'AS niche: realestate_news 가 제공되었으면 그 안의 fresh title 들에서 키워드 후보를 우선 추출하라. ' +
          '각도(지역·정책·청약일정·세금·신혼부부·청년임대·재건축·신도시 등) 다양화 — 한 카테고리에 3개 이상 몰림 금지. ' +
          'evergreen 키워드 머릿속 generate 는 realestate_news 가 비어있을 때만 fallback. '
        : opts.niche === 'HS' && wellness.length > 0
        ? 'WS niche: wellness_news 가 제공되었으면 그 안의 fresh title 들에서 키워드 후보를 우선 추출하라. ' +
          '각도(질환·영양·운동·정신건강·예방·가족건강 등) 다양화 — 한 카테고리에 3개 이상 몰림 금지. ' +
          'evergreen 키워드 머릿속 generate 는 wellness_news 가 비어있을 때만 fallback. '
        : opts.niche === 'TS' && travel.length > 0
        ? 'TS niche: travel_news 가 제공되었으면 그 안의 fresh title 들에서 키워드 후보를 우선 추출하라. ' +
          '각도(국내·해외·숙소·항공·시즌·액티비티·맛집 등) 다양화 — 한 카테고리에 3개 이상 몰림 금지. ' +
          'evergreen 키워드 머릿속 generate 는 travel_news 가 비어있을 때만 fallback. '
        : '맞는 항목이 부족하면 daily_trends를 무시하고 niche categories 안에서 시즌성·검색량 높은 evergreen 키워드를 직접 제안하라. ') +
      (recentKeywords.length > 0
        ? 'CRITICAL CANNIBALIZATION 차단: recent_published_keywords 에 있는 키워드들과 핵심 토픽이 같으면 ' +
          '(지명+토픽 일치, sub-angle 변형 무관) 절대 후보로 추출 금지. 예: 이미 "여의도 재건축 추진 현황" ' +
          '발행 시 "여의도 재건축 맨해튼 벨트 전망"도 차단. 같은 검색 의도면 중복으로 본다. '
        : '') +
      '각 키워드의 category 필드는 niche yaml의 categories[].name 중 하나와 정확히 일치해야 한다.',
  });

  const raw = await callClaude({
    systemPrompt: TREND_HUNTER_PROMPT,
    userMessage,
    expectJson: true,
  });

  const parsed = JSON.parse(raw);

  // Persona may return either an array directly or various envelope shapes
  // (paperclip persona uses {daily_queue: [...]}; older variants use keywords/candidates)
  const candidates: unknown[] = Array.isArray(parsed)
    ? parsed
    : (parsed.keywords ?? parsed.candidates ?? parsed.daily_queue ?? parsed.queue ?? []);

  if (!Array.isArray(candidates)) {
    throw new Error(`trends.pickQueue: unexpected LLM response shape`);
  }

  return candidates.slice(0, count).map(validateCandidate);
}

function validateCandidate(raw: unknown): KeywordCandidate {
  const c = raw as Record<string, unknown>;
  if (typeof c.keyword !== 'string') throw new Error('KeywordCandidate.keyword required');
  if (typeof c.priority_score !== 'number') throw new Error('KeywordCandidate.priority_score required');

  return {
    keyword: c.keyword,
    category: typeof c.category === 'string' ? c.category : '',
    content_type: (c.content_type as KeywordCandidate['content_type']) ?? '정보형',
    search_volume_trend: (c.search_volume_trend as KeywordCandidate['search_volume_trend']) ?? '안정',
    priority_score: c.priority_score,
    evergreen: c.evergreen === true,  // strict: false unless explicitly true
    image_keywords: Array.isArray(c.image_keywords) ? (c.image_keywords as string[]) : [],
  };
}
