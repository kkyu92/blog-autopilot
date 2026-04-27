// AS (부동산·청약) niche 전용 트렌드 source 4종 통합.
// LLM trend-hunter 가 evergreen 머릿속 generate에 의존하지 않고 fresh raw signal에서
// 직접 키워드 추출하도록 데이터를 공급. 9개 AS 카테고리 (청약·매매·정책·세금·재건축·
// 신도시·임대차·투자·인테리어) 균형 분포 가능하도록 source 다양성 확보.

import { extractTag, decodeHtmlEntities } from './trends';

export interface RealEstateSignal {
  title: string;
  link: string;
  pubDate: string; // ISO or RFC822
  source: 'mk' | 'hankyung' | 'korea-policy' | 'google-news';
}

const FETCH_TIMEOUT_MS = 8000;

const FEEDS = {
  mk: 'https://www.mk.co.kr/rss/50300009/',
  hankyung: 'https://www.hankyung.com/feed/realestate',
  koreaPolicy: 'https://www.korea.kr/rss/policy.xml',
  // LH/SH/GH/HUG 발표 + 청약·분양 일정 종합 (broad query)
  googleNews: `https://news.google.com/rss/search?q=${encodeURIComponent('LH OR SH OR GH OR HUG OR 청약 OR 분양')}&hl=ko&gl=KR&ceid=KR:ko`,
};

// 정책브리핑 RSS 는 전부처 정책 모두 포함 → 부동산 관련 항목만 필터.
// 9개 AS 카테고리에 매핑되는 핵심 토큰들 (보수적으로 선정 — false positive 최소화).
const REAL_ESTATE_KEYWORDS = [
  '청약', '분양', '매매', '전세', '월세', '부동산', '주택', '아파트',
  'LTV', 'DTI', 'DSR', '대출 규제',
  '분양가', '양도세', '취득세', '종부세', '재산세', '증여세',
  '재건축', '재개발', '리모델링',
  '신혼부부', '신혼희망', '청년임대', '청년주택', '행복주택', '매입임대', '장기안심',
  'LH', 'SH', 'GH', 'HUG',
  '신도시', '택지지구', '택지', 'GTX', '광역교통',
  '임대차', '전입신고', '보증금', '갱신청구권',
  '오피스텔', '갭투자', '입주권',
];

function isRealEstateRelated(title: string): boolean {
  return REAL_ESTATE_KEYWORDS.some((k) => title.includes(k));
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

export function parseSimpleRss(xml: string): RawRssItem[] {
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

export async function fetchMkRealEstate(): Promise<RealEstateSignal[]> {
  const xml = await fetchRss(FEEDS.mk);
  return parseSimpleRss(xml).map((it) => ({ ...it, source: 'mk' as const }));
}

export async function fetchHankyungRealEstate(): Promise<RealEstateSignal[]> {
  const xml = await fetchRss(FEEDS.hankyung);
  return parseSimpleRss(xml).map((it) => ({ ...it, source: 'hankyung' as const }));
}

export async function fetchKoreaPolicy(): Promise<RealEstateSignal[]> {
  const xml = await fetchRss(FEEDS.koreaPolicy);
  return parseSimpleRss(xml)
    .filter((it) => isRealEstateRelated(it.title))
    .map((it) => ({ ...it, source: 'korea-policy' as const }));
}

export async function fetchInstitutionalNews(): Promise<RealEstateSignal[]> {
  const xml = await fetchRss(FEEDS.googleNews);
  return parseSimpleRss(xml).map((it) => ({ ...it, source: 'google-news' as const }));
}

export interface AggregateAsOptions {
  windowHours?: number;
  maxItems?: number;
  /** Optional injection for test (override fetchers). */
  fetchers?: {
    mk?: () => Promise<RealEstateSignal[]>;
    hankyung?: () => Promise<RealEstateSignal[]>;
    koreaPolicy?: () => Promise<RealEstateSignal[]>;
    googleNews?: () => Promise<RealEstateSignal[]>;
  };
}

export async function aggregateAsSignals(
  opts: AggregateAsOptions = {},
): Promise<RealEstateSignal[]> {
  const { windowHours = 72, maxItems = 80 } = opts;
  const fetchers = {
    mk: opts.fetchers?.mk ?? fetchMkRealEstate,
    hankyung: opts.fetchers?.hankyung ?? fetchHankyungRealEstate,
    koreaPolicy: opts.fetchers?.koreaPolicy ?? fetchKoreaPolicy,
    googleNews: opts.fetchers?.googleNews ?? fetchInstitutionalNews,
  };

  // Parallel fetch — single source 실패해도 나머지는 산출
  const results = await Promise.allSettled([
    fetchers.mk(),
    fetchers.hankyung(),
    fetchers.koreaPolicy(),
    fetchers.googleNews(),
  ]);

  const all: RealEstateSignal[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      all.push(...r.value);
    } else {
      console.warn('[realestate-news] source failed:', r.reason);
    }
  }

  // Time window filter — invalid pubDate 는 통과 (Google News의 일부 케이스)
  const cutoff = Date.now() - windowHours * 3_600_000;
  const recent = all.filter((s) => {
    const t = new Date(s.pubDate).getTime();
    if (!Number.isFinite(t)) return true; // keep when undateable
    return t >= cutoff;
  });

  // Title-based dedup (정규화: 공백 제거 + lowercase)
  const seen = new Set<string>();
  const dedup: RealEstateSignal[] = [];
  for (const s of recent) {
    const norm = s.title.replace(/\s+/g, '').toLowerCase();
    if (norm.length === 0) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    dedup.push(s);
  }

  // Sort: dateable items first (newest first), then undateable
  dedup.sort((a, b) => {
    const ta = new Date(a.pubDate).getTime();
    const tb = new Date(b.pubDate).getTime();
    const va = Number.isFinite(ta) ? ta : -Infinity;
    const vb = Number.isFinite(tb) ? tb : -Infinity;
    return vb - va;
  });

  return dedup.slice(0, maxItems);
}

// Exported for use by trends.ts pickQueue when niche=AS
export { isRealEstateRelated };
