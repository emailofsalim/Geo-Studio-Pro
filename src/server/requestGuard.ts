/**
 * Abuse controls for the AI endpoints.
 *
 * These endpoints proxy a paid API with a key held by the server, so anyone who
 * can reach them can spend the operator's money. There is no user system in this
 * application, so this is deliberately NOT authentication -- it is abuse
 * mitigation, and the difference matters when deciding whether to expose a
 * deployment publicly:
 *
 *   - The origin check stops another website from calling these endpoints with a
 *     visitor's browser. It does not stop a scripted client, which can send any
 *     Origin header it likes.
 *   - The rate limiter is per process. On a long-running server that is the whole
 *     deployment; on serverless it is per warm instance, so the effective limit is
 *     the configured one multiplied by however many instances are warm. It raises
 *     the cost of abuse; it does not cap spend.
 *   - A spend cap belongs at the provider. Nothing here can substitute for one.
 *
 * Set AI_API_TOKEN to require a bearer token instead, which is the right control
 * for machine clients and for any deployment reachable from the open internet.
 */

export interface GuardConfig {
  /** Extra origins allowed besides the request's own host. */
  allowedOrigins: string[];
  /** When set, a matching bearer token is required and the origin check is skipped. */
  token: string | null;
  /** Rate limit window and budget, per client address. */
  windowMs: number;
  maxRequests: number;
  /** Largest request body accepted, in bytes. */
  maxBodyBytes: number;
}

export const DEFAULT_GUARD: GuardConfig = {
  allowedOrigins: [],
  token: null,
  windowMs: 60_000,
  maxRequests: 20,
  // A prompt and its workspace context. The endpoints used to accept 10 MB,
  // which is three orders of magnitude more than any real request needs and is
  // free bandwidth for anyone trying to tie the process up.
  maxBodyBytes: 64 * 1024
};

export function guardConfigFromEnv(env: Record<string, string | undefined>): GuardConfig {
  const num = (v: string | undefined, fallback: number) => {
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    allowedOrigins: (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
    token: env.AI_API_TOKEN ? String(env.AI_API_TOKEN) : null,
    windowMs: num(env.AI_RATE_WINDOW_MS, DEFAULT_GUARD.windowMs),
    maxRequests: num(env.AI_RATE_MAX, DEFAULT_GUARD.maxRequests),
    maxBodyBytes: num(env.AI_MAX_BODY_BYTES, DEFAULT_GUARD.maxBodyBytes)
  };
}

export interface GuardRequest {
  method: string;
  origin?: string | null;
  host?: string | null;
  authorization?: string | null;
  contentLength?: number | null;
  clientId: string;
}

export type GuardVerdict =
  | { ok: true }
  | { ok: false; status: number; error: string; retryAfterSeconds?: number };

/** Fixed-window counters, keyed by client address. Exported for tests. */
const hits = new Map<string, { count: number; resetAt: number }>();

export function resetRateLimiter(): void {
  hits.clear();
}

function sameHost(origin: string, host: string): boolean {
  try {
    // A bare host header has no scheme; compare authority to authority.
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export function guardRequest(
  req: GuardRequest,
  cfg: GuardConfig = DEFAULT_GUARD,
  now: number = Date.now()
): GuardVerdict {
  if (req.method.toUpperCase() !== 'POST') {
    return { ok: false, status: 405, error: 'This endpoint accepts POST only.' };
  }

  if (req.contentLength != null && req.contentLength > cfg.maxBodyBytes) {
    return {
      ok: false,
      status: 413,
      error: `Request body is larger than the ${cfg.maxBodyBytes} byte limit.`
    };
  }

  // A configured token replaces the origin check: it is the stronger control,
  // and machine clients have no meaningful origin.
  if (cfg.token) {
    const supplied = (req.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (supplied !== cfg.token) {
      return { ok: false, status: 401, error: 'A valid bearer token is required.' };
    }
  } else if (req.origin) {
    // Origin is absent for a server-to-server call and present on any browser
    // POST. When present it must be this deployment, or explicitly allowed.
    const allowed =
      (req.host && sameHost(req.origin, req.host)) ||
      cfg.allowedOrigins.some(o => o.toLowerCase() === req.origin!.toLowerCase());
    if (!allowed) {
      return { ok: false, status: 403, error: 'This origin is not allowed to call this endpoint.' };
    }
  }

  const key = req.clientId || 'unknown';
  const seen = hits.get(key);
  if (!seen || seen.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + cfg.windowMs });
  } else if (seen.count >= cfg.maxRequests) {
    return {
      ok: false,
      status: 429,
      error: 'Too many requests. Wait for the current window to end.',
      retryAfterSeconds: Math.max(1, Math.ceil((seen.resetAt - now) / 1000))
    };
  } else {
    seen.count += 1;
  }

  return { ok: true };
}

/**
 * Headers set on every response. The application is a single-page app that
 * loads its own assets and talks only to its own origin, so the policy can be
 * strict without breaking it.
 */
export function securityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'geolocation=(self), camera=(self), microphone=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  };
}
