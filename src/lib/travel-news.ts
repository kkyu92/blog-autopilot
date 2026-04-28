// TS (여행·레저) niche 전용 트렌드 source 5종 통합.
// LLM trend-hunter 가 evergreen 머릿속 generate에 의존하지 않고 fresh raw signal에서
// 직접 키워드 추출하도록 데이터 공급. 4/28 사고 회수 작업의 일환으로 paperclip 시절
// agent stateful 안정성을 stateless LLM call에 input 다양화로 보완.
//
// Source 별 신호 특성 (AS realestate-news.ts 패턴 차용):
// - travel-times: 여행 산업 기사 (commentary + 여행업계 동향)
// - korea-policy: 문화체육관광부 정책 발표 (정책브리핑 RSS, 관광 키워드 필터)
// - google-news-travel: 여행/관광/휴양 일반 (목적지·여행지 가이드)
// - google-news-accommodation: 호텔·항공·면세 (산업·예약 — travel-general 미커버)
// - google-news-season: 명절·연휴·시즌 (황금연휴/추석/설날 — 시즌성 강화)

import { extractTag, decodeHtmlEntities } from './trends';

export interface TravelSignal {
  title: string;
  link: string;
  pubDate: string;
  source: 'travel-times' | 'korea-policy' | 'google-news-travel' | 'google-news-accommodation' | 'google-news-season';
}

const FETCH_TIMEOUT_MS = 8000;

const FEEDS = {
  travelTimes: 'http://www.traveltimes.co.kr/rss/allArticle.xml',
  koreaPolicy: 'https://www.korea.kr/rss/policy.xml',
  googleNewsTravel: `https://news.google.com/rss/search?q=${encodeURIComponent('여행 OR 관광 OR 휴양 OR 여행지')}&hl=ko&gl=KR&ceid=KR:ko`,
  googleNewsAccommodation: `https://news.google.com/rss/search?q=${encodeURIComponent('호텔 OR 항공권 OR 비행기 OR 면세')}&hl=ko&gl=KR&ceid=KR:ko`,
  googleNewsSeason: `https://news.google.com/rss/search?q=${encodeURIComponent('황금연휴 OR 추석 OR 설날 OR 어린이날 OR 휴일')}&hl=ko&gl=KR&ceid=KR:ko`,
};

// 정책브리핑 RSS는 전부처 정책 모두 포함 → 관광·여행 관련만 필터.
const TRAVEL_KEYWORDS = [
  '여행', '관광', '관광지', '여행지', '관광객', '관광산업',
  '휴양', '휴가', '연휴', '명절',
  '국내여행', '해외여행', '단기여행', '장기여행',
  '호텔', '리조트', '펜션', '게스트하우스', '숙소', '캠핑', '글램핑',
  '항공', '항공권', '비행기', '면세', '면세점',
  '비자', '비자면제', '입국', '출국',
  '액티비티', '트레킹', '등산', '스키', '서핑',
  '맛집', '먹방', '로컬푸드',
  '관광공사', '한국관광',
  '문화체육관광부', '문체부',
];

function isTravelRelated(title: string): boolean {
  return TRAVEL_KEYWORDS.some((k) => title.includes(k));
}

function stripCData(s: string): string {
  return s
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
    .trim();
}

async function fetchRss(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`RSS fetch ${url} failed: ${res.status}`);
  return await res.text();
}

interface RawRssItem {
  title: string;
  link: string;
  pubDate: string;
}

function parseSimpleRss(xml: string): RawRssItem[] {
  const items: RawRssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const title = decodeHtmlEntities(stripCData(extractTag(block, 'title')));
    const link = stripCData(extractTag(block, 'link'));
    const pubDate = stripCData(extractTag(block, 'pubDate'));
    if (title) items.push({ title, link, pubDate });
  }
  return items;
}

export async function fetchTravelTimes(): Promise<TravelSignal[]> {
  const xml = await fetchRss(FEEDS.travelTimes);
  return parseSimpleRss(xml).map((it) => ({ ...it, source: 'travel-times' as const }));
}

export async function fetchKoreaPolicyTravel(): Promise<TravelSignal[]> {
  const xml = await fetchRss(FEEDS.koreaPolicy);
  return parseSimpleRss(xml)
    .filter((it) => isTravelRelated(it.title))
    .map((it) => ({ ...it, source: 'korea-policy' as const }));
}

export async function fetchGoogleNewsTravel(): Promise<TravelSignal[]> {
  const xml = await fetchRss(FEEDS.googleNewsTravel);
  return parseSimpleRss(xml).map((it) => ({ ...it, source: 'google-news-travel' as const }));
}

export async function fetchGoogleNewsAccommodation(): Promise<TravelSignal[]> {
  const xml = await fetchRss(FEEDS.googleNewsAccommodation);
  return parseSimpleRss(xml).map((it) => ({ ...it, source: 'google-news-accommodation' as const }));
}

export async function fetchGoogleNewsSeason(): Promise<TravelSignal[]> {
  const xml = await fetchRss(FEEDS.googleNewsSeason);
  return parseSimpleRss(xml).map((it) => ({ ...it, source: 'google-news-season' as const }));
}

export interface AggregateTsOptions {
  windowHours?: number;
  maxItems?: number;
  fetchers?: {
    travelTimes?: () => Promise<TravelSignal[]>;
    koreaPolicy?: () => Promise<TravelSignal[]>;
    googleNewsTravel?: () => Promise<TravelSignal[]>;
    googleNewsAccommodation?: () => Promise<TravelSignal[]>;
    googleNewsSeason?: () => Promise<TravelSignal[]>;
  };
}

export async function aggregateTsSignals(
  opts: AggregateTsOptions = {},
): Promise<TravelSignal[]> {
  const { windowHours = 72, maxItems = 80 } = opts;
  const fetchers = {
    travelTimes: opts.fetchers?.travelTimes ?? fetchTravelTimes,
    koreaPolicy: opts.fetchers?.koreaPolicy ?? fetchKoreaPolicyTravel,
    googleNewsTravel: opts.fetchers?.googleNewsTravel ?? fetchGoogleNewsTravel,
    googleNewsAccommodation: opts.fetchers?.googleNewsAccommodation ?? fetchGoogleNewsAccommodation,
    googleNewsSeason: opts.fetchers?.googleNewsSeason ?? fetchGoogleNewsSeason,
  };

  const results = await Promise.allSettled([
    fetchers.travelTimes(),
    fetchers.koreaPolicy(),
    fetchers.googleNewsTravel(),
    fetchers.googleNewsAccommodation(),
    fetchers.googleNewsSeason(),
  ]);

  const all: TravelSignal[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      all.push(...r.value);
    } else {
      console.warn('[travel-news] source failed:', r.reason);
    }
  }

  const cutoff = Date.now() - windowHours * 3_600_000;
  const recent = all.filter((s) => {
    const t = new Date(s.pubDate).getTime();
    if (!Number.isFinite(t)) return true;
    return t >= cutoff;
  });

  const seen = new Set<string>();
  const dedup: TravelSignal[] = [];
  for (const s of recent) {
    const norm = s.title.replace(/\s+/g, '').toLowerCase();
    if (norm.length === 0) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    dedup.push(s);
  }

  dedup.sort((a, b) => {
    const ta = new Date(a.pubDate).getTime();
    const tb = new Date(b.pubDate).getTime();
    const va = Number.isFinite(ta) ? ta : -Infinity;
    const vb = Number.isFinite(tb) ? tb : -Infinity;
    return vb - va;
  });

  return dedup.slice(0, maxItems);
}

export { isTravelRelated };
