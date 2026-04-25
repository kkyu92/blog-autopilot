import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getWordPressCredentials, getBloggerCredentials } from '../tokens';

afterEach(() => { vi.unstubAllEnvs(); });

describe('getWordPressCredentials', () => {
  beforeEach(() => {
    vi.stubEnv('WORDPRESS_WS_ACCESS_TOKEN', 'ws-token');
    vi.stubEnv('WORDPRESS_WS_BLOG_ID', '253891859');
    vi.stubEnv('WORDPRESS_WS_CLIENT_ID', 'client-id');
    vi.stubEnv('WORDPRESS_WS_SITE', 'worldsignal.com');
    vi.stubEnv('WORDPRESS_WS_CATEGORY_ID', '42');
  });

  it('WS niche → WORDPRESS_WS_ACCESS_TOKEN + BLOG_ID', () => {
    const result = getWordPressCredentials('WS');
    expect(result.accessToken).toBe('ws-token');
    expect(result.blogId).toBe('253891859');
  });

  it('forwards optional fields (clientId, site, categoryId)', () => {
    const result = getWordPressCredentials('WS');
    expect(result.clientId).toBe('client-id');
    expect(result.site).toBe('worldsignal.com');
    expect(result.categoryId).toBe('42');
  });

  it('optional fields undefined when env not set', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('WORDPRESS_WS_ACCESS_TOKEN', 'ws-token');
    vi.stubEnv('WORDPRESS_WS_BLOG_ID', '253891859');
    const result = getWordPressCredentials('WS');
    expect(result.clientId).toBeUndefined();
    expect(result.site).toBeUndefined();
    expect(result.categoryId).toBeUndefined();
  });

  it('TS niche reads WORDPRESS_TS_* keys', () => {
    vi.stubEnv('WORDPRESS_TS_ACCESS_TOKEN', 'ts-token');
    vi.stubEnv('WORDPRESS_TS_BLOG_ID', 'ts-blog-id');
    const result = getWordPressCredentials('TS');
    expect(result.accessToken).toBe('ts-token');
    expect(result.blogId).toBe('ts-blog-id');
  });

  it('missing ACCESS_TOKEN → throws with key name in message', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('WORDPRESS_WS_BLOG_ID', 'blog');
    expect(() => getWordPressCredentials('WS')).toThrow(/WORDPRESS_WS_ACCESS_TOKEN/);
  });

  it('missing BLOG_ID → throws with key name in message', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('WORDPRESS_WS_ACCESS_TOKEN', 'token');
    expect(() => getWordPressCredentials('WS')).toThrow(/WORDPRESS_WS_BLOG_ID/);
  });

  it('TS niche missing ACCESS_TOKEN → throws with TS key name', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('WORDPRESS_TS_BLOG_ID', 'ts-blog');
    expect(() => getWordPressCredentials('TS')).toThrow(/WORDPRESS_TS_ACCESS_TOKEN/);
  });
});

describe('getBloggerCredentials', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'rt');
    vi.stubEnv('GOOGLE_BLOG_ID', 'bid');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'cs');
  });

  it('returns all 4 fields', () => {
    const result = getBloggerCredentials();
    expect(result).toEqual({ refreshToken: 'rt', blogId: 'bid', clientId: 'cid', clientSecret: 'cs' });
  });

  it('missing GOOGLE_REFRESH_TOKEN → throws', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('GOOGLE_BLOG_ID', 'bid');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'cs');
    expect(() => getBloggerCredentials()).toThrow(/GOOGLE_REFRESH_TOKEN/);
  });

  it('missing GOOGLE_BLOG_ID → throws', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'rt');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'cs');
    expect(() => getBloggerCredentials()).toThrow(/GOOGLE_BLOG_ID/);
  });

  it('missing GOOGLE_CLIENT_ID → throws', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'rt');
    vi.stubEnv('GOOGLE_BLOG_ID', 'bid');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'cs');
    expect(() => getBloggerCredentials()).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it('missing GOOGLE_CLIENT_SECRET → throws', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'rt');
    vi.stubEnv('GOOGLE_BLOG_ID', 'bid');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid');
    expect(() => getBloggerCredentials()).toThrow(/GOOGLE_CLIENT_SECRET/);
  });
});
