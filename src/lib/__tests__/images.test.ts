import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';

// images.ts is tested via dynamic import to allow env-stub isolation
describe('images.fetchForSlots', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    vi.stubEnv('PEXELS_API_KEY', 'test-pexels');
    vi.stubEnv('PIXABAY_API_KEY', 'test-pixabay');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // ─── helpers ───────────────────────────────────────────────────────────────

  function makePexelsOk(url = 'https://pexels.com/img.jpg', photographer = 'Alice') {
    return {
      ok: true,
      status: 200,
      json: async () => ({ photos: [{ src: { large: url }, photographer }] }),
    };
  }

  function makePixabayOk(url = 'https://pixabay.com/img.jpg', user = 'Bob') {
    return {
      ok: true,
      status: 200,
      json: async () => ({ hits: [{ largeImageURL: url, user }] }),
    };
  }

  function makeSlot(overrides?: Partial<{ slot_id: string; search_query: string; alt_text: string }>) {
    return {
      slot_id: 'img-1',
      search_query: 'beautiful landscape',
      alt_text: '아름다운 풍경',
      ...overrides,
    };
  }

  // ─── 1. Pexels success ─────────────────────────────────────────────────────

  it('Pexels 성공 → source=pexels, image_url from src.large', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makePexelsOk());

    const { fetchForSlots } = await import('../images');
    const [result] = await fetchForSlots([makeSlot()]);

    expect(result.source).toBe('pexels');
    expect(result.image_url).toBe('https://pexels.com/img.jpg');
    expect(result.photographer).toBe('Alice');
  });

  // ─── 2. Pexels HTTP 401 → fall to Pixabay ─────────────────────────────────

  it('Pexels 401 → Pixabay fallback → source=pixabay', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, status: 401 }) // pexels fails
      .mockResolvedValueOnce(makePixabayOk());

    const { fetchForSlots } = await import('../images');
    const [result] = await fetchForSlots([makeSlot()]);

    expect(result.source).toBe('pixabay');
    expect(result.image_url).toBe('https://pixabay.com/img.jpg');
    expect(result.photographer).toBe('Bob');
  });

  // ─── 3. Pexels empty results → fall to Pixabay ────────────────────────────

  it('Pexels empty photos[] → Pixabay fallback', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ photos: [] }),
      })
      .mockResolvedValueOnce(makePixabayOk());

    const { fetchForSlots } = await import('../images');
    const [result] = await fetchForSlots([makeSlot()]);

    expect(result.source).toBe('pixabay');
  });

  // ─── 4. Both APIs fail → placeholder ──────────────────────────────────────

  it('양쪽 API 실패 → placeholder', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, status: 500 }) // pexels
      .mockResolvedValueOnce({ ok: false, status: 500 }); // pixabay

    const { fetchForSlots } = await import('../images');
    const [result] = await fetchForSlots([makeSlot()]);

    expect(result.source).toBe('placeholder');
    expect(result.image_url).toBe('https://via.placeholder.com/1200x630.png?text=No+Image');
    expect(result.photographer).toBeNull();
  });

  // ─── 5. Pexels env missing → fall to Pixabay ──────────────────────────────

  it('PEXELS_API_KEY 없음 → Pixabay fallback', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('PIXABAY_API_KEY', 'test-pixabay');
    // PEXELS_API_KEY not set

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makePixabayOk());

    const { fetchForSlots } = await import('../images');
    const [result] = await fetchForSlots([makeSlot()]);

    expect(result.source).toBe('pixabay');
  });

  // ─── 6. Pixabay env missing → placeholder ─────────────────────────────────

  it('PIXABAY_API_KEY 없음 → placeholder', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('PEXELS_API_KEY', 'test-pexels');
    // PIXABAY_API_KEY not set

    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, status: 401 }); // pexels 401

    const { fetchForSlots } = await import('../images');
    const [result] = await fetchForSlots([makeSlot()]);

    expect(result.source).toBe('placeholder');
    expect(result.photographer).toBeNull();
  });

  // ─── 7. Multiple slots with mixed outcomes ─────────────────────────────────

  it('3 slots — pexels / pixabay / placeholder 각각 다른 source', async () => {
    // Promise.all fires all 3 Pexels calls concurrently first, then Pixabay calls
    (global.fetch as ReturnType<typeof vi.fn>)
      // Pexels calls (all 3 in parallel, order matches slot array order)
      .mockResolvedValueOnce(makePexelsOk('https://pexels.com/1.jpg', 'P1')) // slot1 pexels → success
      .mockResolvedValueOnce({ ok: false, status: 404 })                      // slot2 pexels → fail
      .mockResolvedValueOnce({ ok: false, status: 500 })                      // slot3 pexels → fail
      // Pixabay calls follow (slots 2 and 3 concurrently)
      .mockResolvedValueOnce(makePixabayOk('https://pixabay.com/2.jpg', 'Px2')) // slot2 pixabay → success
      .mockResolvedValueOnce({ ok: false, status: 500 });                        // slot3 pixabay → fail

    const { fetchForSlots } = await import('../images');
    const results = await fetchForSlots([
      makeSlot({ slot_id: 'img-1', search_query: 'cats' }),
      makeSlot({ slot_id: 'img-2', search_query: 'dogs' }),
      makeSlot({ slot_id: 'img-3', search_query: 'fish' }),
    ]);

    expect(results).toHaveLength(3);
    expect(results[0].source).toBe('pexels');
    expect(results[1].source).toBe('pixabay');
    expect(results[2].source).toBe('placeholder');
  });

  // ─── 8. AbortError on Pexels → fall to Pixabay ────────────────────────────

  it('Pexels AbortError → Pixabay fallback', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce(makePixabayOk());

    const { fetchForSlots } = await import('../images');
    const [result] = await fetchForSlots([makeSlot()]);

    expect(result.source).toBe('pixabay');
  });

  // ─── 9. alt_text preserved ────────────────────────────────────────────────

  it('alt_text 보존 — 한글 포함', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makePexelsOk());

    const { fetchForSlots } = await import('../images');
    const [result] = await fetchForSlots([makeSlot({ alt_text: '바다 풍경' })]);

    expect(result.alt_text).toBe('바다 풍경');
  });

  // ─── 10. slot_id preserved ────────────────────────────────────────────────

  it('slot_id 보존', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makePexelsOk());

    const { fetchForSlots } = await import('../images');
    const [result] = await fetchForSlots([makeSlot({ slot_id: 'hero-image' })]);

    expect(result.slot_id).toBe('hero-image');
  });

  // ─── 11. photographer is null (not undefined) on placeholder ──────────────

  it('placeholder → photographer는 null (undefined 아님)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 });

    const { fetchForSlots } = await import('../images');
    const [result] = await fetchForSlots([makeSlot()]);

    expect(result.photographer).toBeNull();
    // strictly null, not undefined
    expect(result.photographer === null).toBe(true);
  });

  // ─── 12. encodeURIComponent applied to search_query ──────────────────────

  it('search_query URL 인코딩 — 바람 좋은 날 → encoded in URL', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makePexelsOk());

    const { fetchForSlots } = await import('../images');
    await fetchForSlots([makeSlot({ search_query: '바람 좋은 날' })]);

    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain(encodeURIComponent('바람 좋은 날'));
  });

  // ─── 13. JSON parse error on Pexels → null → Pixabay ─────────────────────

  it('Pexels JSON parse error → tryPexels returns null → Pixabay fallback', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError('Unexpected token'); },
      })
      .mockResolvedValueOnce(makePixabayOk());

    const { fetchForSlots } = await import('../images');
    const [result] = await fetchForSlots([makeSlot()]);

    expect(result.source).toBe('pixabay');
  });
});
