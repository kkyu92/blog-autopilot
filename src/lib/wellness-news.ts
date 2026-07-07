// WS (건강·의료·웰빙) niche 전용 트렌드 source 5종 통합.
// LLM trend-hunter 가 evergreen 머릿속 generate에 의존하지 않고 fresh raw signal에서
// 직접 키워드 추출하도록 데이터 공급. 4/28 사고 (run 25026708984 WS×1 회수 dispatch
// queue exhausted: 5 keywords 중 3 dedup 100% 차단)의 근본해결 — Google daily trends
// 단일 source 의존도를 줄이고 의료/정책/시장 다양성 확보.
//
// Source 별 신호 특성 (AS realestate-news.ts 패턴 차용):
// - health-chosun: 건강·의료 기사 (commentary + 라이프스타일)
// - medipana: 의약 산업 뉴스 (제약·바이오·의료기기)
// - korea-policy: 보건복지부 정책 발표 (정책브리핑 RSS, 보건복지 키워드 필터)
// - google-news-health: 건강/의료 일반 (질환·증상·영양·운동)
// - google-news-medical: 의약/치료 (약·처방·백신 — health-general 미커버)

import { extractTag, decodeHtmlEntities } from './trends';

export interface WellnessSignal {
  title: string;
  link: string;
  pubDate: string;
  source: 'health-chosun' | 'medipana' | 'korea-policy' | 'google-news-health' | 'google-news-medical';
}

const FETCH_TIMEOUT_MS = 8000;

const FEEDS = {
  healthChosun: `https://news.google.com/rss/search?q=${encodeURIComponent('웰빙 OR 건강습관 OR 다이어트 OR 수면건강 OR 스트레스관리')}&hl=ko&gl=KR&ceid=KR:ko`,
  medipana: `https://news.google.com/rss/search?q=${encodeURIComponent('제약 OR 바이오 OR 의료기기 OR 임상시험 OR 신약')}&hl=ko&gl=KR&ceid=KR:ko`,
  koreaPolicy: `https://news.google.com/rss/search?q=${encodeURIComponent('건강보험 OR 보건복지부 OR 질병관리청 OR 의료정책')}&hl=ko&gl=KR&ceid=KR:ko`,
  googleNewsHealth: `https://news.google.com/rss/search?q=${encodeURIComponent('건강 OR 의료 OR 영양 OR 운동 OR 질환')}&hl=ko&gl=KR&ceid=KR:ko`,
  googleNewsMedical: `https://news.google.com/rss/search?q=${encodeURIComponent('약 OR 처방 OR 치료 OR 백신 OR 면역')}&hl=ko&gl=KR&ceid=KR:ko`,
};

// 정책브리핑 RSS는 전부처 정책 모두 포함 → 보건복지 관련만 필터.
// substring 매칭이라 짧은 키워드(예: '건강')가 긴 변형(건강검진/건강보험 등) cover.
const WELLNESS_KEYWORDS = [
  '건강', '의료', '의약', '병원', '약국', '약사', '의사',
  '질환', '질병', '치료', '진료', '진단', '처방', '검사',
  '영양', '식단', '다이어트', '체중', '비만',
  '운동', '체력', '근력', '유산소',
  '면역', '백신', '예방접종',
  '감기', '독감', '코로나', '알레르기', '비염', '천식', '호흡기',
  '당뇨', '고혈압', '심혈관', '뇌졸중', '암',
  '수면', '불면', '정신건강', '우울', '불안', '스트레스',
  '여성건강', '산모', '임신', '어린이건강', '소아',
  '노인건강', '치매', '근감소증',
  '건강검진', '건강보험',
  '보건', '복지', '의료보험',
  '한방', '한의학', '대체의학',
];

function isWellnessRelated(title: string): boolean {
  return WELLNESS_KEYWORDS.some((k) => title.includes(k));
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

export async function fetchHealthChosun(): Promise<WellnessSignal[]> {
  const xml = await fetchRss(FEEDS.healthChosun);
  return parseSimpleRss(xml).map((it) => ({ ...it, source: 'health-chosun' as const }));
}

export async function fetchMedipana(): Promise<WellnessSignal[]> {
  const xml = await fetchRss(FEEDS.medipana);
  return parseSimpleRss(xml).map((it) => ({ ...it, source: 'medipana' as const }));
}

export async function fetchKoreaPolicyWellness(): Promise<WellnessSignal[]> {
  const xml = await fetchRss(FEEDS.koreaPolicy);
  return parseSimpleRss(xml)
    .filter((it) => isWellnessRelated(it.title))
    .map((it) => ({ ...it, source: 'korea-policy' as const }));
}

export async function fetchGoogleNewsHealth(): Promise<WellnessSignal[]> {
  const xml = await fetchRss(FEEDS.googleNewsHealth);
  return parseSimpleRss(xml).map((it) => ({ ...it, source: 'google-news-health' as const }));
}

export async function fetchGoogleNewsMedical(): Promise<WellnessSignal[]> {
  const xml = await fetchRss(FEEDS.googleNewsMedical);
  return parseSimpleRss(xml).map((it) => ({ ...it, source: 'google-news-medical' as const }));
}

export interface AggregateWsOptions {
  windowHours?: number;
  maxItems?: number;
  fetchers?: {
    healthChosun?: () => Promise<WellnessSignal[]>;
    medipana?: () => Promise<WellnessSignal[]>;
    koreaPolicy?: () => Promise<WellnessSignal[]>;
    googleNewsHealth?: () => Promise<WellnessSignal[]>;
    googleNewsMedical?: () => Promise<WellnessSignal[]>;
  };
}

export async function aggregateWsSignals(
  opts: AggregateWsOptions = {},
): Promise<WellnessSignal[]> {
  const { windowHours = 72, maxItems = 80 } = opts;
  const fetchers = {
    healthChosun: opts.fetchers?.healthChosun ?? fetchHealthChosun,
    medipana: opts.fetchers?.medipana ?? fetchMedipana,
    koreaPolicy: opts.fetchers?.koreaPolicy ?? fetchKoreaPolicyWellness,
    googleNewsHealth: opts.fetchers?.googleNewsHealth ?? fetchGoogleNewsHealth,
    googleNewsMedical: opts.fetchers?.googleNewsMedical ?? fetchGoogleNewsMedical,
  };

  const results = await Promise.allSettled([
    fetchers.healthChosun(),
    fetchers.medipana(),
    fetchers.koreaPolicy(),
    fetchers.googleNewsHealth(),
    fetchers.googleNewsMedical(),
  ]);

  const all: WellnessSignal[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      all.push(...r.value);
    } else {
      console.warn('[wellness-news] source failed:', r.reason);
    }
  }

  const cutoff = Date.now() - windowHours * 3_600_000;
  const recent = all.filter((s) => {
    const t = new Date(s.pubDate).getTime();
    if (!Number.isFinite(t)) return true;
    return t >= cutoff;
  });

  const seen = new Set<string>();
  const dedup: WellnessSignal[] = [];
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

export { isWellnessRelated };
