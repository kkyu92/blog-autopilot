import { callClaude } from './llm.js';
import { aggregateAsSignals } from './realestate-news.js';
import { aggregateTsSignals } from './travel-news.js';
import type { KeywordCandidate } from './trends.js';

// 숙면 evergreen variants — deterministic daily rotation
const HS_VARIANTS = [
  '숙면에 좋은 음식',
  '숙면 방법',
  '숙면을 위한 환경 조성',
  '숙면 루틴 만들기',
  '숙면 베개 선택법',
  '숙면 스트레칭',
  '숙면 아로마테라피',
  '수면 보조제 효과',
  '숙면 음악 효과',
  '수면의 질 높이는 방법',
  '깊은 수면 방해 요인',
  '불면증 숙면 개선',
  '취침 전 루틴 숙면',
  '숙면 수면 환경 만들기',
];

function todayHsVariant(): string {
  const today = new Date();
  const dayOfYear = Math.floor(
    (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  return HS_VARIANTS[dayOfYear % HS_VARIANTS.length];
}

export async function getFixedTopicKeyword(niche: 'HS' | 'TS' | 'AS'): Promise<KeywordCandidate | null> {
  try {
    if (niche === 'HS') {
      const keyword = todayHsVariant();
      return {
        keyword,
        category: '수면건강',
        content_type: '정보형',
        search_volume_trend: '안정',
        priority_score: 90,
        evergreen: true,
        image_keywords: ['숙면', '수면', '침실'],
      };
    }

    if (niche === 'AS') {
      const signals = await aggregateAsSignals({ windowHours: 48, maxItems: 30 });
      const userMessage = JSON.stringify({
        task: '아래 부동산 뉴스 신호에서 현재 검색 관심이 가장 높은 청약 공고 1건을 선정해 keyword를 반환하라. keyword는 실제 검색어 형태 (예: "힐스테이트 동탄역 청약 일정", "래미안 레벤투스 청약 조건")로.',
        signals: signals.slice(0, 20).map((s) => ({ title: s.title, source: s.source })),
      });
      const raw = await callClaude({
        systemPrompt: '응답은 반드시 JSON 단일 객체만. {"keyword": "..."}',
        userMessage,
        expectJson: true,
        timeoutMs: 45_000,
      });
      const parsed = JSON.parse(raw.trim()) as { keyword?: string };
      if (!parsed.keyword) return null;
      return {
        keyword: parsed.keyword,
        category: '청약정보',
        content_type: '정보형',
        search_volume_trend: '급상승',
        priority_score: 95,
        evergreen: false,
        image_keywords: ['청약', '아파트', '분양'],
      };
    }

    if (niche === 'TS') {
      const signals = await aggregateTsSignals({ windowHours: 48, maxItems: 30 });
      const userMessage = JSON.stringify({
        task: '아래 여행/축제 뉴스 신호에서 현재 검색 관심이 가장 높은 국내 축제 1건을 선정해 keyword를 반환하라. keyword는 실제 검색어 형태 (예: "진주 남강유등축제 2025 일정", "보령머드축제 방법")로.',
        signals: signals.slice(0, 20).map((s) => ({ title: s.title, source: s.source })),
      });
      const raw = await callClaude({
        systemPrompt: '응답은 반드시 JSON 단일 객체만. {"keyword": "..."}',
        userMessage,
        expectJson: true,
        timeoutMs: 45_000,
      });
      const parsed = JSON.parse(raw.trim()) as { keyword?: string };
      if (!parsed.keyword) return null;
      return {
        keyword: parsed.keyword,
        category: '국내축제',
        content_type: '정보형',
        search_volume_trend: '급상승',
        priority_score: 95,
        evergreen: false,
        image_keywords: ['축제', '국내여행', '행사'],
      };
    }
  } catch (err) {
    console.warn(
      `[fixed-topics] getFixedTopicKeyword ${niche} failed:`,
      err instanceof Error ? err.message : String(err),
    );
  }
  return null;
}
