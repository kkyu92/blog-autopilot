import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { publishScheduled, type WPScheduledPost } from '../wordpress';

// Minimal valid post fixture
const minimalPost: WPScheduledPost = {
  title: 'Test Title',
  content: '<p>Hello world</p>',
  slug: 'test-title',
};

const fullPost: WPScheduledPost = {
  title: 'Full Post',
  content: '<p>Full content</p>',
  slug: 'full-post',
  excerpt: 'Short excerpt',
  categories: ['Tech', 'AI'],
  tags: ['automation', 'wordpress'],
};

const scheduledDate = new Date('2026-04-27T01:00:00.000Z');

const successResponse = {
  ID: 12345,
  URL: 'https://example.wordpress.com/2026/04/27/test-title/',
  date: '2026-04-27T01:00:00+00:00',
};

function makeOkResponse(data: object) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

function makeErrResponse(status: number, text = 'Error') {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => text,
  } as unknown as Response;
}

describe('publishScheduled', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('WORDPRESS_WS_ACCESS_TOKEN', 'ws-access-token');
    vi.stubEnv('WORDPRESS_WS_BLOG_ID', 'ws-blog-123');
    vi.stubEnv('WORDPRESS_TS_ACCESS_TOKEN', 'ts-access-token');
    vi.stubEnv('WORDPRESS_TS_BLOG_ID', 'ts-blog-456');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  // 1. Success WS: 200 → returns {externalId, externalUrl, scheduledAt}
  it('WS niche success → returns externalId, externalUrl, scheduledAt', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(makeOkResponse(successResponse));

    const result = await publishScheduled('WS', minimalPost, scheduledDate);

    expect(result.externalId).toBe('12345');
    expect(result.externalUrl).toBe(successResponse.URL);
    expect(result.scheduledAt).toBe(successResponse.date);
  });

  // 2. Success TS: niche='TS' uses WORDPRESS_TS_* env keys
  it('TS niche success → uses WORDPRESS_TS_* credentials', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(makeOkResponse({ ID: 99, URL: 'https://ts.wordpress.com/post/', date: '2026-04-27T01:00:00+00:00' }));

    const result = await publishScheduled('TS', minimalPost, scheduledDate);

    expect(result.externalId).toBe('99');
    // Verify it used ts-blog-456 in the URL
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('ts-blog-456'),
      expect.any(Object)
    );
  });

  // 3. Body shape: status=future, date=ISO, title, content, slug
  it('POST body contains status=future, ISO date, title, content, slug', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(makeOkResponse(successResponse));

    await publishScheduled('WS', minimalPost, scheduledDate);

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);

    expect(body.status).toBe('future');
    expect(body.date).toBe(scheduledDate.toISOString());
    expect(body.title).toBe(minimalPost.title);
    expect(body.content).toBe(minimalPost.content);
    expect(body.slug).toBe(minimalPost.slug);
  });

  // 4. Bearer token header
  it('Authorization header uses Bearer token from env', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(makeOkResponse(successResponse));

    await publishScheduled('WS', minimalPost, scheduledDate);

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers['Authorization']).toBe('Bearer ws-access-token');
  });

  // 5. 5xx retry → success on attempt 2
  it('5xx on attempt 1, 200 on attempt 2 → succeeds', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeErrResponse(503, 'Service Unavailable'))
      .mockResolvedValueOnce(makeOkResponse(successResponse));

    const result = await publishScheduled('WS', minimalPost, scheduledDate);

    expect(result.externalId).toBe('12345');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  // 6. 5xx fail all 3 → throw with last error
  it('5xx on all 3 attempts → throws after 3 tries', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeErrResponse(500, 'Internal Server Error'))
      .mockResolvedValueOnce(makeErrResponse(500, 'Internal Server Error'))
      .mockResolvedValueOnce(makeErrResponse(500, 'Internal Server Error'));

    await expect(publishScheduled('WS', minimalPost, scheduledDate)).rejects.toThrow('500');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  // 7. 4xx no retry: 401 → throw immediately, fetch called only once
  it('401 → throws immediately without retrying (fetch called once)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(makeErrResponse(401, 'Unauthorized'));

    await expect(publishScheduled('WS', minimalPost, scheduledDate)).rejects.toThrow('401');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  // 8. 400 no retry
  it('400 Bad Request → throws immediately without retrying', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(makeErrResponse(400, 'Bad Request'));

    await expect(publishScheduled('WS', minimalPost, scheduledDate)).rejects.toThrow('400');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  // 9. Network error retry → success on second attempt
  it('network error on attempt 1, success on attempt 2', async () => {
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(makeOkResponse(successResponse));

    const result = await publishScheduled('WS', minimalPost, scheduledDate);

    expect(result.externalId).toBe('12345');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  // 10. AbortError (timeout) retry → success
  it('AbortError on attempt 1, success on attempt 2', async () => {
    const abortErr = new DOMException('The operation was aborted', 'AbortError');
    global.fetch = vi.fn()
      .mockRejectedValueOnce(abortErr)
      .mockResolvedValueOnce(makeOkResponse(successResponse));

    const result = await publishScheduled('WS', minimalPost, scheduledDate);

    expect(result.externalId).toBe('12345');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  // 11. Missing env → throws via getWordPressCredentials
  it('missing WORDPRESS_WS_ACCESS_TOKEN → throws credential error', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('WORDPRESS_WS_BLOG_ID', 'ws-blog');
    // Don't set WORDPRESS_WS_ACCESS_TOKEN

    await expect(publishScheduled('WS', minimalPost, scheduledDate)).rejects.toThrow(
      /WORDPRESS_WS_ACCESS_TOKEN/
    );
  });

  // 12. Scheduled date forwarded to body
  it('scheduledFor date → body.date is that exact ISO string', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(makeOkResponse(successResponse));
    const specificDate = new Date('2026-05-10T14:30:00.000Z');

    await publishScheduled('WS', minimalPost, specificDate);

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.date).toBe('2026-05-10T14:30:00.000Z');
  });

  // 13. Full post with optional fields → body includes them
  it('full post with excerpt, categories, tags → body includes all fields', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(makeOkResponse(successResponse));

    await publishScheduled('WS', fullPost, scheduledDate);

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.excerpt).toBe(fullPost.excerpt);
    expect(body.categories).toEqual(fullPost.categories);
    expect(body.tags).toEqual(fullPost.tags);
  });

  // 14. Minimal post (no optional fields) → body omits undefined fields
  it('minimal post without optional fields → body.excerpt undefined (omitted)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(makeOkResponse(successResponse));

    await publishScheduled('WS', minimalPost, scheduledDate);

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    expect('excerpt' in body).toBe(false);
    expect('categories' in body).toBe(false);
    expect('tags' in body).toBe(false);
  });

  // 15. externalId is always a string even if API returns numeric ID
  it('API returns numeric ID → externalId is string', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(makeOkResponse({ ID: 42, URL: 'https://u.com/', date: 'd' }));

    const result = await publishScheduled('WS', minimalPost, scheduledDate);

    expect(typeof result.externalId).toBe('string');
    expect(result.externalId).toBe('42');
  });

  // 16. Exponential backoff timing: 1s between attempt 1-2, 2s between 2-3
  it('exp backoff: ~1s after attempt 1, ~2s after attempt 2', async () => {
    vi.useFakeTimers();

    global.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('net1'))
      .mockRejectedValueOnce(new Error('net2'))
      .mockResolvedValueOnce(makeOkResponse(successResponse));

    const promise = publishScheduled('WS', minimalPost, scheduledDate);

    // After 999ms, still waiting for 1st backoff (1000ms)
    await vi.advanceTimersByTimeAsync(999);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // After 1ms more (total 1000ms), 2nd attempt fires
    await vi.advanceTimersByTimeAsync(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    // After another 1999ms, still waiting for 2nd backoff (2000ms)
    await vi.advanceTimersByTimeAsync(1999);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    // After 1ms more (total 2000ms from attempt 2), 3rd attempt fires
    await vi.advanceTimersByTimeAsync(1);

    const result = await promise;
    expect(result.externalId).toBe('12345');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
