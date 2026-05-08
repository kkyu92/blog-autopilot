import type { Niche } from './schema';

/**
 * AS (apt-signal) 통합 라벨 맵 — 21개 fragmented 라벨 → 6개 카테고리.
 * AdSense 사이트 주제 통일성 어필 + thin content 신호 해소 (5/6 prep).
 *
 * key = 통합 target 라벨, value = LLM 자유 생성 옛/변형 라벨 source 배열.
 *
 * 5/6 일회성 cleanup: scripts/migration/relabel-as.mjs 의 LABEL_MAP 과 동일.
 * 변경 시 양쪽 동기화 필요.
 */
export const LABEL_MAP_AS: Record<string, string[]> = {
  '청약': ['청약', '청약정보', '아파트 청약', '청약·부동산', '아파트 분양'],
  '재건축·재개발': ['재건축', '재건축·재개발', '재개발·재건축', '재개발', '재건축재개발'],
  '세금·절세': ['부동산 세금', '부동산세금', '부동산·세금', '세금·절세', '부동산 절세', '세금'],
  '시장분석': ['부동산', '부동산 시장분석', '부동산 투자 분석', '부동산 트렌드', '시장분석'],
  '정책·법령': ['부동산정책', '임대·분양', '정부정책', '정책·법령'],
  '대출·전세': ['부동산/대출 정보', '부동산/전세', '대출', '전세', '대출·전세'],
};

const REVERSE_MAP_AS = (() => {
  const m = new Map<string, string>();
  for (const [target, sources] of Object.entries(LABEL_MAP_AS)) {
    for (const src of sources) m.set(src, target);
  }
  return m;
})();

const DEFAULT_AS_LABEL = '시장분석';

/**
 * niche=AS 의 경우 LLM 자유 생성 라벨을 통합 6개 카테고리로 normalize.
 * - 매핑 가능 (REVERSE_MAP_AS hit) → target 라벨로 치환
 * - 매핑 불가 (unknown) → drop (사이트 주제 통일성 정책)
 * - 결과 빈 배열 → default '시장분석' 1개
 *
 * HS/TS 는 pass-through (통합 라벨 미정의 — 추후 prep 시 동일 패턴 추가).
 */
export function normalizeLabels(niche: Niche, labels: string[] | undefined): string[] {
  if (niche !== 'AS') return labels ?? [];

  const input = labels ?? [];
  if (input.length === 0) return [DEFAULT_AS_LABEL];

  const mapped = new Set<string>();
  for (const label of input) {
    const target = REVERSE_MAP_AS.get(label);
    if (target) mapped.add(target);
  }

  if (mapped.size === 0) return [DEFAULT_AS_LABEL];
  return [...mapped];
}
