import { describe, it, expect } from 'vitest';
import { TARGET_PER_NICHE, TARGET_TOTAL } from '../daily-check';

describe('daily-check 발행 목표치', () => {
  it('니치당 2건 × 3니치 = 총 6건이어야 한다 (볼륨 축소 반영)', () => {
    expect(TARGET_PER_NICHE).toBe(2);
    expect(TARGET_TOTAL).toBe(6);
  });

  it('TARGET_TOTAL은 TARGET_PER_NICHE × 3과 항상 일치해야 한다 (드리프트 방지)', () => {
    expect(TARGET_TOTAL).toBe(TARGET_PER_NICHE * 3);
  });
});
