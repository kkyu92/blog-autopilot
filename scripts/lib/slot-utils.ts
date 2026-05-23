/**
 * slot-utils.ts — 슬롯 관련 순수 유틸 함수
 *
 * auto-publish.ts 에서 추출한 독립적 유틸. 외부 의존 없음.
 * - pickSlotTime: 가용 슬롯 시간 선택
 * - assignSlug: slug 충돌 회피
 * - toIsoUtc: KST 슬롯 시간 → UTC ISO 변환
 * - errMessage: unknown 에러 → string 변환
 */

// Note: 슬롯은 sequential pick (테스트 결정성). 모든 niche가 동일하게 09:00→11:00→13:00 순서로 채움 —
// niche 간 wall-clock stagger 없음. H7 publisher는 동시 호출 가능성 인지 필요.
export const PUBLISH_HOURS_KST = ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00'] as const;

export function pickSlotTime(used: Set<string>): string {
  const available = (PUBLISH_HOURS_KST as readonly string[]).filter((h) => !used.has(h));
  if (available.length === 0) {
    throw new Error('all_slots_used');
  }
  // sequential pick (deterministic for tests; niche당 3슬롯이라 충돌 가능성 낮음)
  const picked = available[0];
  used.add(picked); // mutate internally for symmetry with assignSlug
  return picked;
}

export function assignSlug(rawSlug: string, usedSlugs: Set<string>): string {
  if (!usedSlugs.has(rawSlug)) {
    usedSlugs.add(rawSlug);
    return rawSlug;
  }
  for (let i = 2; i <= 99; i++) {
    const candidate = `${rawSlug}-${i}`;
    if (!usedSlugs.has(candidate)) {
      usedSlugs.add(candidate);
      return candidate;
    }
  }
  throw new Error('slug_exhausted');
}

/**
 * 'HH:MM' KST → 오늘 KST 날짜의 그 시각 (UTC ISO).
 *
 * Example: baseDate=2026-04-26 02:00 UTC (= 11:00 KST), slotTimeKst='13:00'
 *   → 2026-04-26 04:00 UTC (= 13:00 KST today, no rollover)
 *
 * cron(KST 01:17) 발화 시 모든 slot(09~19시)이 미래라 정상.
 * manual dispatch에서 slot 시간이 이미 지났으면 그대로 과거 시간 ISO 반환
 * (publisher가 처리; Blogger는 status='future'+과거date에 대해 immediate publish 변환).
 */
export function toIsoUtc(slotTimeKst: string, baseDate: Date = new Date()): string {
  const [hh, mm] = slotTimeKst.split(':').map(Number);
  // baseDate를 KST 날짜로 변환 후 그날의 HH:MM 슬롯 시각 만들기.
  const kstNow = new Date(baseDate.getTime() + 9 * 60 * 60 * 1000); // UTC + 9h = KST clock
  const yyyy = kstNow.getUTCFullYear();
  const mo = kstNow.getUTCMonth();
  const dd = kstNow.getUTCDate();
  // 오늘 KST 날짜의 HH:MM → UTC: KST HH:MM = UTC HH-9:MM (전날 00시 ~ 09시 사이는 음수 → setUTCHours 정규화)
  const slot = new Date(Date.UTC(yyyy, mo, dd, hh - 9, mm, 0, 0));
  return slot.toISOString();
}

export function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
