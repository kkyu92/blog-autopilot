import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { publishScheduled } from '../blogger';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const scheduledDate = new Date('2026-04-27T09:00:00.000Z');

const minimalPost = {
  title: 'Test Blog Post',
  content: '<p>Hello blogger</p>',
};

const postWithLabels = {
  title: 'Labeled Post',
  content: '<p>Content with labels</p>',
  labels: ['tech', 'automation', 'ai'],
};

const tokenResponse = {
  access_token: 'ya29.access-token-abc',
  expires_in: 3600,
  token_type: 'Bearer',
  scope: 'https://www.googleapis.com/auth/blogger',
};

const draftResponse = {
  id: 'draft-post-id-123',
  status: 'DRAFT',
  title: 'Test Blog Post',
};

const publishResponse = {
  id: 'pub-post-id-456',
  url: 'https://myblog.blogspot.com/2026/04/test-blog-post.html',
  published: '2026-04-27T09:00:00.000Z',
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('publishScheduled (Blogger)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'test-refresh-token');
    vi.stubEnv('GOOGLE_BLOG_ID', 'test-blog-id-789');
    vi.stubEnv('GOOGLE_BLOG_ID_HEALTH', 'test-blog-id-health-789');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client-id.apps.googleusercontent.com');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-client-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  // 1. Success path: token refresh → draft → publish → returns externalId/Url/scheduledAt
  it('success path → returns externalId, externalUrl, scheduledAt', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeOkResponse(tokenResponse))   // token refresh
      .mockResolvedValueOnce(makeOkResponse(draftResponse))   // create draft
      .mockResolvedValueOnce(makeOkResponse(publishResponse)); // publish

    const result = await publishScheduled('AS', minimalPost, scheduledDate);

    expect(result.externalId).toBe('pub-post-id-456');
    expect(result.externalUrl).toBe('https://myblog.blogspot.com/2026/04/test-blog-post.html');
    expect(result.scheduledAt).toBe('2026-04-27T09:00:00.000Z');
  });

  // 2. Token refresh body: form-urlencoded with grant_type, refresh_token, client_id, client_secret
  it('token refresh → POST form-urlencoded with correct fields', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeOkResponse(tokenResponse))
      .mockResolvedValueOnce(makeOkResponse(draftResponse))
      .mockResolvedValueOnce(makeOkResponse(publishResponse));

    await publishScheduled('AS', minimalPost, scheduledDate);

    const [tokenUrl, tokenInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    expect(tokenInit.method).toBe('POST');
    expect(tokenInit.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    const params = new URLSearchParams(tokenInit.body as string);
    expect(params.get('grant_type')).toBe('refresh_token');
    expect(params.get('refresh_token')).toBe('test-refresh-token');
    expect(params.get('client_id')).toBe('test-client-id.apps.googleusercontent.com');
    expect(params.get('client_secret')).toBe('test-client-secret');
  });

  // 3. Token refresh failure: 401 → throws immediately (no retry)
  it('token refresh 401 → throws without retrying draft/publish', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeErrResponse(401, 'invalid_grant'));

    await expect(publishScheduled('AS', minimalPost, scheduledDate)).rejects.toThrow(
      /Blogger token refresh fail/
    );
    // Only one fetch call (the token refresh), nothing else
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  // 4. Draft request body: title, content, labels in JSON + Bearer header
  it('draft → POST JSON body with title/content, Authorization Bearer header', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeOkResponse(tokenResponse))
      .mockResolvedValueOnce(makeOkResponse(draftResponse))
      .mockResolvedValueOnce(makeOkResponse(publishResponse));

    // niche='HS' → labels pass-through (AS normalize 정책은 별도 test).
    await publishScheduled('HS', postWithLabels, scheduledDate);

    const [draftUrl, draftInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(draftUrl).toContain('test-blog-id-health-789');
    expect(draftInit.method).toBe('POST');
    expect(draftInit.headers['Authorization']).toBe('Bearer ya29.access-token-abc');
    expect(draftInit.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(draftInit.body as string);
    expect(body.title).toBe('Labeled Post');
    expect(body.content).toBe('<p>Content with labels</p>');
    expect(body.labels).toEqual(['tech', 'automation', 'ai']);
  });

  // 5. Draft URL contains ?isDraft=true
  it('draft URL contains ?isDraft=true', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeOkResponse(tokenResponse))
      .mockResolvedValueOnce(makeOkResponse(draftResponse))
      .mockResolvedValueOnce(makeOkResponse(publishResponse));

    await publishScheduled('AS', minimalPost, scheduledDate);

    const [draftUrl] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(draftUrl).toContain('?isDraft=true');
  });

  // 6. Publish URL contains ?publishDate= with encoded ISO date
  it('publish URL contains publishDate with encoded ISO date', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeOkResponse(tokenResponse))
      .mockResolvedValueOnce(makeOkResponse(draftResponse))
      .mockResolvedValueOnce(makeOkResponse(publishResponse));

    await publishScheduled('AS', minimalPost, scheduledDate);

    const [pubUrl] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[2];
    expect(pubUrl).toContain('draft-post-id-123');
    expect(pubUrl).toContain('publishDate=');
    expect(pubUrl).toContain(encodeURIComponent(scheduledDate.toISOString()));
  });

  // 7. Publish HTTP 5xx → retry: first publish call 503, retry succeeds
  it('publish 5xx → retries and succeeds on next attempt', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeOkResponse(tokenResponse))   // token
      .mockResolvedValueOnce(makeOkResponse(draftResponse))   // draft
      .mockResolvedValueOnce(makeErrResponse(503, 'Service Unavailable')) // publish fail
      .mockResolvedValueOnce(makeOkResponse(publishResponse)); // publish retry

    const result = await publishScheduled('AS', minimalPost, scheduledDate);

    expect(result.externalId).toBe('pub-post-id-456');
    // 4 total calls: token + draft + publish-fail + publish-retry
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  // 8. Publish 4xx → fast fail: 400 → throws, fetch only called once for publish
  it('publish 400 → throws immediately (no retry for publish)', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeOkResponse(tokenResponse))  // token
      .mockResolvedValueOnce(makeOkResponse(draftResponse))  // draft
      .mockResolvedValueOnce(makeErrResponse(400, 'Bad Request')); // publish 4xx

    await expect(publishScheduled('AS', minimalPost, scheduledDate)).rejects.toThrow(
      /Blogger publish fail.*400/
    );
    // Token + draft + publish (no retry) = 3 calls
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  // 9. Network error retry on draft → retry succeeds
  it('AbortError on draft → retries and succeeds', async () => {
    const abortErr = new DOMException('The operation was aborted', 'AbortError');

    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeOkResponse(tokenResponse))  // token
      .mockRejectedValueOnce(abortErr)                       // draft timeout
      .mockResolvedValueOnce(makeOkResponse(draftResponse))  // draft retry
      .mockResolvedValueOnce(makeOkResponse(publishResponse)); // publish

    const result = await publishScheduled('AS', minimalPost, scheduledDate);

    expect(result.externalId).toBe('pub-post-id-456');
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  // 10. No labels passed (HS pass-through) → labels field absent from draft body
  it('no labels in post (HS pass-through) → labels field absent from draft body', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeOkResponse(tokenResponse))
      .mockResolvedValueOnce(makeOkResponse(draftResponse))
      .mockResolvedValueOnce(makeOkResponse(publishResponse));

    await publishScheduled('HS', minimalPost, scheduledDate);

    const [, draftInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    const body = JSON.parse(draftInit.body as string);
    expect('labels' in body).toBe(false);
  });

  // 11. Multiple labels (HS pass-through) → all present in body
  it('labels array (HS pass-through) → all labels in draft body', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeOkResponse(tokenResponse))
      .mockResolvedValueOnce(makeOkResponse(draftResponse))
      .mockResolvedValueOnce(makeOkResponse(publishResponse));

    await publishScheduled('HS', postWithLabels, scheduledDate);

    const [, draftInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    const body = JSON.parse(draftInit.body as string);
    expect(body.labels).toEqual(['tech', 'automation', 'ai']);
  });

  // 11a. AS normalize: 옛/random 라벨 → 통합 6 카테고리로 강제 (5/6 prep 정책 영구화)
  it('AS niche → labels normalized to integrated 6 categories (drop unknown, default fallback)', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeOkResponse(tokenResponse))
      .mockResolvedValueOnce(makeOkResponse(draftResponse))
      .mockResolvedValueOnce(makeOkResponse(publishResponse));

    const asPost = {
      title: 'AS post',
      content: '<p>x</p>',
      labels: ['아파트 청약', '재건축', '양도세 중과'], // 정확 2 + substring 1 (양도세→세금·절세)
    };
    await publishScheduled('AS', asPost, scheduledDate);

    const [, draftInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    const body = JSON.parse(draftInit.body as string);
    expect(body.labels.sort()).toEqual(['세금·절세', '재건축·재개발', '청약'].sort());
  });

  it('AS niche + no labels → default 시장분석 적용', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeOkResponse(tokenResponse))
      .mockResolvedValueOnce(makeOkResponse(draftResponse))
      .mockResolvedValueOnce(makeOkResponse(publishResponse));

    await publishScheduled('AS', minimalPost, scheduledDate);

    const [, draftInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    const body = JSON.parse(draftInit.body as string);
    expect(body.labels).toEqual(['시장분석']);
  });

  // 12. Exp backoff timing: ~1s/2s waits between retries (fake timers)
  it('exp backoff on publish retry: ~1s after first fail', async () => {
    vi.useFakeTimers();

    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeOkResponse(tokenResponse))  // token
      .mockResolvedValueOnce(makeOkResponse(draftResponse))  // draft
      .mockRejectedValueOnce(new Error('net error'))         // publish fail 1
      .mockRejectedValueOnce(new Error('net error 2'))       // publish fail 2
      .mockResolvedValueOnce(makeOkResponse(publishResponse)); // publish success

    const promise = publishScheduled('AS', minimalPost, scheduledDate);

    // After token + draft succeed, publish attempt 1 is made
    // Still waiting for 1st backoff (1000ms)
    await vi.advanceTimersByTimeAsync(999);
    // token + draft + publish-fail-1 = 3 calls so far
    expect(global.fetch).toHaveBeenCalledTimes(3);

    // After 1ms more (total 1000ms backoff), 2nd publish attempt fires
    await vi.advanceTimersByTimeAsync(1);
    expect(global.fetch).toHaveBeenCalledTimes(4);

    // After another 1999ms, waiting for 2nd backoff (2000ms)
    await vi.advanceTimersByTimeAsync(1999);
    expect(global.fetch).toHaveBeenCalledTimes(4);

    // After 1ms more (total 2000ms), 3rd publish attempt fires
    await vi.advanceTimersByTimeAsync(1);

    const result = await promise;
    expect(result.externalId).toBe('pub-post-id-456');
    expect(global.fetch).toHaveBeenCalledTimes(5);
  });
});
