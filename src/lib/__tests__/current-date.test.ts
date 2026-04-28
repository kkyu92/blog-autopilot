import { describe, it, expect } from 'vitest';
import {
  getCurrentDate,
  buildCurrentDateHeader,
  findOutdatedYearInTitle,
} from '../current-date';

describe('getCurrentDate', () => {
  it('returns YYYY-MM-DD KST string + numeric year', () => {
    // 2026-04-28 00:00 UTC = 2026-04-28 09:00 KST
    const fixed = new Date('2026-04-28T00:00:00Z');
    const r = getCurrentDate(fixed);
    expect(r.date).toBe('2026-04-28');
    expect(r.year).toBe(2026);
  });

  it('KST cross-midnight: 2026-04-28 16:00 UTC → 2026-04-29 KST', () => {
    const fixed = new Date('2026-04-28T16:00:00Z'); // 2026-04-29 01:00 KST
    const r = getCurrentDate(fixed);
    expect(r.date).toBe('2026-04-29');
    expect(r.year).toBe(2026);
  });
});

describe('buildCurrentDateHeader', () => {
  it('header에 [CURRENT CONTEXT] + 현재 날짜·연도 + outdated year 금지 룰 포함', () => {
    const fixed = new Date('2026-04-28T00:00:00Z');
    const h = buildCurrentDateHeader(fixed);
    expect(h).toContain('[CURRENT CONTEXT]');
    expect(h).toContain('2026-04-28');
    expect(h).toContain('현재 연도: 2026');
    expect(h).toContain('2025'); // outdated 예시로 명시
    expect(h).toContain('금지');
  });
});

describe('findOutdatedYearInTitle', () => {
  it.each([
    // outdated → return year
    ['서울 장기안심주택 보증금 지원 신청 방법 완벽 가이드 2025', 2026, 2025],
    ['건강검진 항목 2024', 2026, 2024],
    ['2023 부동산 정책 회고', 2026, 2023],
  ])('"%s" (current=%d) → outdated year %d', (title, current, expected) => {
    expect(findOutdatedYearInTitle(title, current)).toBe(expected);
  });

  it.each([
    // current year → null
    ['일본 무비자 입국 2026 완벽 가이드', 2026],
    ['2026 황금연휴 캠핑장 추천', 2026],
    // future year (예약·일정 토픽) → null (허용)
    ['2027 청약 일정 미리보기', 2026],
    // no year → null
    ['숙면을 위한 수면 위생 습관 7가지', 2026],
    ['공덕역 자이르네 청약 1순위 조건', 2026],
  ])('"%s" (current=%d) → null (no outdated)', (title, current) => {
    expect(findOutdatedYearInTitle(title, current)).toBeNull();
  });

  it('mixed years: 가장 먼저 발견된 outdated 반환', () => {
    expect(findOutdatedYearInTitle('2025 vs 2026 비교', 2026)).toBe(2025);
  });
});
