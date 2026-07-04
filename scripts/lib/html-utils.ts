/**
 * html-utils.ts — HTML 생성/조작 순수 유틸 함수
 *
 * auto-publish.ts 에서 추출한 독립적 HTML 유틸. ImageResult 타입만 의존.
 * - escAttr: HTML attribute 이스케이프
 * - buildImageFigure: <figure><img> 표준 마크업 생성
 * - injectImages: IMAGE_SLOT 마커 → 실제 이미지 HTML 치환
 */

import type { ImageResult } from '../../src/lib/images';

/**
 * HTML attribute 이스케이프.
 * image_url은 third-party JSON (Pexels/Pixabay), alt_text는 LLM 출력 —
 * 둘 다 신뢰 불가. 한글 따옴표/꺾쇠 등으로 attribute injection 또는 broken HTML 방지.
 */
export function escAttr(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * content-writer.md spec: HTML uses `<!-- IMAGE_SLOT_N -->` comment markers.
 * image_slots[].slot_id is the literal string "IMAGE_SLOT_N" (e.g., "IMAGE_SLOT_1").
 *
 * Editor persona가 요구하는 표준 image figure (editor.md 검수 기준):
 * loading="lazy" + border-radius:8px + max-width:100% + width:100% + display:block + figcaption.
 * 단순 <img> 태그면 매번 revision_needed reject 됨 (운영 중 발견).
 */
export function buildImageFigure(r: ImageResult): string {
  const credit =
    r.source === 'placeholder'
      ? 'Placeholder'
      : r.photographer
        ? `${r.source.charAt(0).toUpperCase() + r.source.slice(1)} · ${r.photographer}`
        : r.source.charAt(0).toUpperCase() + r.source.slice(1);
  return (
    `<figure style="margin:24px 0;">` +
    `<img src="${escAttr(r.image_url)}" alt="${escAttr(r.alt_text)}" loading="lazy" ` +
    `style="border-radius:8px;max-width:100%;width:100%;display:block;" />` +
    `<figcaption style="font-size:13px;color:#888888;text-align:center;margin-top:8px;">` +
    `📷 Photo: ${escAttr(credit)}` +
    `</figcaption></figure>`
  );
}

export function injectImages(html: string, results: ImageResult[]): string {
  let out = html;
  const matched = new Set<string>();
  for (const r of results) {
    const marker = `<!-- ${r.slot_id} -->`;
    if (out.includes(marker)) {
      matched.add(r.slot_id);
    }
    out = out.split(marker).join(buildImageFigure(r));
  }
  // Writer가 직접 만들어 둔 raw <img> 태그가 있을 수 있음 (editor revision attempt에서 LLM이 placeholder 옆에
  // 임의 inject). 이 경우 IMAGE_SLOT placeholder 옆 raw <img>는 위 split 후 stray로 남음. 운영 안정화 후
  // 별도 정리 (now: 단순 stray marker 경고만).
  const unmatched = results.filter((r) => !matched.has(r.slot_id));
  if (unmatched.length > 0) {
    console.warn(
      `[injectImages] unmatched results: ${unmatched.map((r) => r.slot_id).join(',')}`,
    );
  }
  const stray = out.match(/<!-- IMAGE_SLOT_\d+ -->/g);
  if (stray) {
    console.warn(`[injectImages] stray markers in published HTML: ${stray.join(',')}`);
  }
  return out;
}
