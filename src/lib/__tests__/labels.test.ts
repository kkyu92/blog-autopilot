import { describe, it, expect } from 'vitest';
import { normalizeLabels, LABEL_MAP_AS } from '../labels';

describe('normalizeLabels — niche=AS', () => {
  it('LABEL_MAP_AS source 라벨을 target 으로 매핑', () => {
    expect(normalizeLabels('AS', ['아파트 청약'])).toEqual(['청약']);
    expect(normalizeLabels('AS', ['재건축'])).toEqual(['재건축·재개발']);
    expect(normalizeLabels('AS', ['부동산세금'])).toEqual(['세금·절세']);
    expect(normalizeLabels('AS', ['부동산 트렌드'])).toEqual(['시장분석']);
    expect(normalizeLabels('AS', ['정부정책'])).toEqual(['정책·법령']);
    expect(normalizeLabels('AS', ['전세'])).toEqual(['대출·전세']);
  });

  it('이미 통합 target 라벨 그대로면 동일 유지', () => {
    expect(normalizeLabels('AS', ['청약', '시장분석'])).toEqual(
      expect.arrayContaining(['청약', '시장분석']),
    );
  });

  it('unknown 라벨은 drop → default 로 fallback (정책: AdSense 통일성)', () => {
    const result = normalizeLabels('AS', ['양도세 중과', '매물 잠김', '풍무지구 분양']);
    expect(result).toEqual(['시장분석']);
  });

  it('mixed: 매핑 가능 + unknown → 매핑 가능만 남고 unknown drop', () => {
    const result = normalizeLabels('AS', ['청약', '양도세 중과', '재건축', '매물 잠김']);
    expect(result.sort()).toEqual(['재건축·재개발', '청약'].sort());
  });

  it('중복 매핑 dedup', () => {
    const result = normalizeLabels('AS', ['재건축', '재개발', '재건축·재개발']);
    expect(result).toEqual(['재건축·재개발']);
  });

  it('빈 배열 → default 라벨', () => {
    expect(normalizeLabels('AS', [])).toEqual(['시장분석']);
  });

  it('undefined → default 라벨', () => {
    expect(normalizeLabels('AS', undefined)).toEqual(['시장분석']);
  });

  it('all unknown → default 라벨', () => {
    expect(normalizeLabels('AS', ['random1', 'random2'])).toEqual(['시장분석']);
  });
});

describe('normalizeLabels — niche!=AS (pass-through)', () => {
  it('HS niche → labels 그대로 반환', () => {
    const labels = ['건강', '운동', '식단'];
    expect(normalizeLabels('HS', labels)).toEqual(labels);
  });

  it('TS niche → labels 그대로 반환 (자유 라벨 허용)', () => {
    const labels = ['여행', 'JFK 공항', '항공권'];
    expect(normalizeLabels('TS', labels)).toEqual(labels);
  });

  it('HS niche + undefined → 빈 배열', () => {
    expect(normalizeLabels('HS', undefined)).toEqual([]);
  });
});

describe('LABEL_MAP_AS 구조 검증', () => {
  it('통합 카테고리 6개', () => {
    expect(Object.keys(LABEL_MAP_AS).length).toBe(6);
  });

  it('target 라벨이 자기 자신을 source 에 포함 (idempotent normalize)', () => {
    for (const [target, sources] of Object.entries(LABEL_MAP_AS)) {
      expect(sources).toContain(target);
    }
  });
});

