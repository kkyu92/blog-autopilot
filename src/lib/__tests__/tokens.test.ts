import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getBloggerCredentials } from '../tokens';

afterEach(() => { vi.unstubAllEnvs(); });

// 5/5 WP→Blogger 마이그레이션 후 WP credentials 함수 제거.
// Blogger 멀티 niche (AS/TS/WS) 지원 — 도메인 일관 명명 (APT/TRAVEL/HEALTH).

describe('getBloggerCredentials', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'rt');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'cs');
    vi.stubEnv('GOOGLE_BLOG_ID_APT', 'apt-blog');
    vi.stubEnv('GOOGLE_BLOG_ID_TRAVEL', 'travel-blog');
    vi.stubEnv('GOOGLE_BLOG_ID_HEALTH', 'health-blog');
  });

  it('default niche=AS → GOOGLE_BLOG_ID_APT 반환', () => {
    const result = getBloggerCredentials();
    expect(result).toEqual({ refreshToken: 'rt', blogId: 'apt-blog', clientId: 'cid', clientSecret: 'cs' });
  });

  it('niche=TS → GOOGLE_BLOG_ID_TRAVEL 반환', () => {
    const result = getBloggerCredentials('TS');
    expect(result.blogId).toBe('travel-blog');
  });

  it('niche=WS → GOOGLE_BLOG_ID_HEALTH 반환', () => {
    const result = getBloggerCredentials('WS');
    expect(result.blogId).toBe('health-blog');
  });

  it('niche=AS — GOOGLE_BLOG_ID_APT 우선, 없으면 GOOGLE_BLOG_ID fallback', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'rt');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'cs');
    vi.stubEnv('GOOGLE_BLOG_ID', 'legacy-blog');
    const result = getBloggerCredentials('AS');
    expect(result.blogId).toBe('legacy-blog');
  });

  it('missing GOOGLE_REFRESH_TOKEN → throws', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'cs');
    vi.stubEnv('GOOGLE_BLOG_ID_APT', 'apt-blog');
    expect(() => getBloggerCredentials('AS')).toThrow(/GOOGLE_REFRESH_TOKEN/);
  });

  it('missing GOOGLE_BLOG_ID_TRAVEL (TS niche) → throws with key name', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'rt');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'cs');
    expect(() => getBloggerCredentials('TS')).toThrow(/GOOGLE_BLOG_ID_TRAVEL/);
  });

  it('missing GOOGLE_BLOG_ID_HEALTH (WS niche) → throws with key name', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'rt');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'cs');
    expect(() => getBloggerCredentials('WS')).toThrow(/GOOGLE_BLOG_ID_HEALTH/);
  });

  it('missing GOOGLE_CLIENT_ID → throws', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'rt');
    vi.stubEnv('GOOGLE_BLOG_ID_APT', 'apt-blog');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'cs');
    expect(() => getBloggerCredentials('AS')).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it('missing GOOGLE_CLIENT_SECRET → throws', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'rt');
    vi.stubEnv('GOOGLE_BLOG_ID_APT', 'apt-blog');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid');
    expect(() => getBloggerCredentials('AS')).toThrow(/GOOGLE_CLIENT_SECRET/);
  });
});
