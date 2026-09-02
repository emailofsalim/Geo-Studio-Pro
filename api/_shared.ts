/**
 * Adapter between Vercel's function signature and the transport-free service.
 *
 * Vercel serves anything under api/ as a Node function. These files exist
 * because the deployed application is a static Vite build: without them the
 * frontend's calls to /api/ai/* return 404, which is exactly what they did.
 */
import { guardConfigFromEnv, guardRequest, securityHeaders, GuardRequest } from '../src/server/requestGuard';

type Req = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  socket?: { remoteAddress?: string };
};
type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

const header = (req: Req, name: string): string | null => {
  const v = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] ?? null : (v ?? null);
};

/** The address the platform saw, which is what the rate limiter counts. */
function clientId(req: Req): string {
  const fwd = header(req, 'x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return header(req, 'x-real-ip') || req.socket?.remoteAddress || 'unknown';
}

export function applySecurityHeaders(res: Res): void {
  for (const [k, v] of Object.entries(securityHeaders())) res.setHeader(k, v);
}

/**
 * Runs the guard. Returns true when the caller should continue; when it returns
 * false the response has already been sent.
 */
export function passesGuard(req: Req, res: Res, env: Record<string, string | undefined>): boolean {
  applySecurityHeaders(res);
  const g: GuardRequest = {
    method: req.method || 'GET',
    origin: header(req, 'origin'),
    host: header(req, 'host'),
    authorization: header(req, 'authorization'),
    contentLength: Number(header(req, 'content-length')) || null,
    clientId: clientId(req)
  };
  const verdict = guardRequest(g, guardConfigFromEnv(env));
  if (verdict.ok) return true;
  if (verdict.retryAfterSeconds) res.setHeader('Retry-After', String(verdict.retryAfterSeconds));
  res.status(verdict.status).json({ error: verdict.error });
  return false;
}

export type { Req as VercelLikeRequest, Res as VercelLikeResponse };
