import { describe, it, expect, beforeEach } from 'vitest';
import {
  guardRequest,
  guardConfigFromEnv,
  securityHeaders,
  resetRateLimiter,
  DEFAULT_GUARD,
  GuardConfig
} from '../requestGuard';

const cfg = (over: Partial<GuardConfig> = {}): GuardConfig => ({ ...DEFAULT_GUARD, ...over });
const post = (over: Partial<Parameters<typeof guardRequest>[0]> = {}) => ({
  method: 'POST',
  origin: 'https://app.example.com' as string | null,
  host: 'app.example.com' as string | null,
  authorization: null as string | null,
  contentLength: 100 as number | null,
  clientId: '203.0.113.9',
  ...over
});

beforeEach(() => resetRateLimiter());

describe('AI endpoint guard', () => {
  it('allows a same-origin POST from the deployment itself', () => {
    expect(guardRequest(post(), cfg())).toEqual({ ok: true });
  });

  it('allows a call with no Origin, which is server to server', () => {
    expect(guardRequest(post({ origin: null }), cfg())).toEqual({ ok: true });
  });

  it('refuses another site calling with a visitor browser', () => {
    // These endpoints spend the operator's money. A page on another origin must
    // not be able to make a visitor's browser drive them.
    const v = guardRequest(post({ origin: 'https://evil.example' }), cfg());
    expect(v.ok).toBe(false);
    expect(v).toMatchObject({ status: 403 });
  });

  it('allows an origin the operator listed', () => {
    expect(
      guardRequest(post({ origin: 'https://staging.example.com' }),
        cfg({ allowedOrigins: ['https://staging.example.com'] }))
    ).toEqual({ ok: true });
  });

  it('accepts POST only', () => {
    for (const method of ['GET', 'PUT', 'DELETE', 'OPTIONS']) {
      expect(guardRequest(post({ method }), cfg()), method).toMatchObject({ ok: false, status: 405 });
    }
  });

  it('refuses a body larger than the limit', () => {
    // The endpoints used to accept 10 MB, which no real prompt approaches.
    expect(guardRequest(post({ contentLength: DEFAULT_GUARD.maxBodyBytes + 1 }), cfg()))
      .toMatchObject({ ok: false, status: 413 });
  });

  it('rate limits a single caller and says when to retry', () => {
    const c = cfg({ maxRequests: 3, windowMs: 60_000 });
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(guardRequest(post(), c, t), `request ${i + 1}`).toEqual({ ok: true });
    }
    const v = guardRequest(post(), c, t);
    expect(v).toMatchObject({ ok: false, status: 429 });
    expect((v as any).retryAfterSeconds).toBeGreaterThan(0);
  });

  it('counts each caller separately', () => {
    const c = cfg({ maxRequests: 1 });
    const t = 1_000_000;
    expect(guardRequest(post({ clientId: 'a' }), c, t)).toEqual({ ok: true });
    expect(guardRequest(post({ clientId: 'b' }), c, t), 'a different caller has its own budget')
      .toEqual({ ok: true });
    expect(guardRequest(post({ clientId: 'a' }), c, t)).toMatchObject({ status: 429 });
  });

  it('lets the window expire', () => {
    const c = cfg({ maxRequests: 1, windowMs: 60_000 });
    const t = 1_000_000;
    expect(guardRequest(post(), c, t)).toEqual({ ok: true });
    expect(guardRequest(post(), c, t + 1000)).toMatchObject({ status: 429 });
    expect(guardRequest(post(), c, t + 60_001), 'a new window starts').toEqual({ ok: true });
  });

  it('requires the bearer token when one is configured', () => {
    const c = cfg({ token: 'sekret' });
    expect(guardRequest(post(), c)).toMatchObject({ ok: false, status: 401 });
    expect(guardRequest(post({ authorization: 'Bearer wrong' }), c)).toMatchObject({ status: 401 });
    expect(guardRequest(post({ authorization: 'Bearer sekret' }), c)).toEqual({ ok: true });
  });

  it('lets a valid token stand in for the origin check', () => {
    // A machine client has no meaningful Origin, and the token is the stronger
    // control, so it replaces the weaker one rather than stacking with it.
    const c = cfg({ token: 'sekret' });
    expect(guardRequest(post({ origin: 'https://elsewhere.example', authorization: 'Bearer sekret' }), c))
      .toEqual({ ok: true });
  });

  it('reads its configuration from the environment, with sane fallbacks', () => {
    const c = guardConfigFromEnv({
      ALLOWED_ORIGINS: 'https://a.example, https://b.example',
      AI_API_TOKEN: 'tok',
      AI_RATE_MAX: '5',
      AI_RATE_WINDOW_MS: '1000'
    });
    expect(c.allowedOrigins).toEqual(['https://a.example', 'https://b.example']);
    expect(c.token).toBe('tok');
    expect(c.maxRequests).toBe(5);
    expect(c.windowMs).toBe(1000);

    const empty = guardConfigFromEnv({});
    expect(empty.token, 'no token configured means no token required').toBeNull();
    expect(empty.allowedOrigins).toEqual([]);
    expect(empty.maxRequests).toBe(DEFAULT_GUARD.maxRequests);

    const junk = guardConfigFromEnv({ AI_RATE_MAX: 'not a number', AI_RATE_WINDOW_MS: '-5' });
    expect(junk.maxRequests, 'a bad value falls back rather than disabling the limit')
      .toBe(DEFAULT_GUARD.maxRequests);
    expect(junk.windowMs).toBe(DEFAULT_GUARD.windowMs);
  });

  it('sets the headers a single-page app can live with', () => {
    const h = securityHeaders();
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Referrer-Policy']).toBe('no-referrer');
    // The application uses the camera and location, so the policy must permit
    // them for its own origin or it would break its own features.
    expect(h['Permissions-Policy']).toMatch(/geolocation=\(self\)/);
    expect(h['Permissions-Policy']).toMatch(/camera=\(self\)/);
  });
});
