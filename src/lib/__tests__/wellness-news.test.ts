import { describe, it, expect } from 'vitest';
import { aggregateWsSignals, isWellnessRelated, type WellnessSignal } from '../wellness-news';

describe('isWellnessRelated', () => {
  it.each([
    ['건강검진 항목 2026', true],
    ['수면 위생 7가지', true],
    ['알레르기 비염 치료', true],
    ['고혈압 관리법', true],
    ['백신 접종 안내', true],
    ['우울증 자가진단', true],
    // negative
    ['아파트 매매 시장', false],
    ['황금연휴 여행', false],
    ['연예인 결혼 소식', false],
  ])('"%s" → %s', (title, expected) => {
    expect(isWellnessRelated(title)).toBe(expected);
  });
});

describe('aggregateWsSignals', () => {
  it('각 source 결과 통합 + 시간 윈도우 필터 + dedup', async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 1 * 3_600_000).toUTCString();
    const old = new Date(now.getTime() - 100 * 3_600_000).toUTCString();
    const mk = (s: WellnessSignal['source'], titles: string[], dates: string[]): WellnessSignal[] =>
      titles.map((t, i) => ({ title: t, link: 'x', pubDate: dates[i], source: s }));

    const result = await aggregateWsSignals({
      windowHours: 72,
      fetchers: {
        healthChosun: async () => mk('health-chosun', ['건강검진 안내'], [recent]),
        medipana: async () => mk('medipana', ['신약 임상시험'], [recent]),
        koreaPolicy: async () => mk('korea-policy', ['건강보험 개정', '오래된 발표'], [recent, old]),
        googleNewsHealth: async () => mk('google-news-health', ['수면 위생 가이드'], [recent]),
        googleNewsMedical: async () => mk('google-news-medical', ['건강검진 안내'], [recent]), // dup
      },
    });

    // 5 fresh - 1 dup - 1 old = 4
    expect(result).toHaveLength(4);
    expect(result.map((r) => r.source).sort()).toEqual(
      ['google-news-health', 'health-chosun', 'korea-policy', 'medipana'].sort(),
    );
  });

  it('단일 source 실패해도 나머지 산출', async () => {
    const recent = new Date(Date.now() - 1 * 3_600_000).toUTCString();
    const result = await aggregateWsSignals({
      fetchers: {
        healthChosun: async () => { throw new Error('boom'); },
        medipana: async () => [{ title: '의약품 회수', link: 'x', pubDate: recent, source: 'medipana' }],
        koreaPolicy: async () => [],
        googleNewsHealth: async () => [],
        googleNewsMedical: async () => [],
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('medipana');
  });
});
