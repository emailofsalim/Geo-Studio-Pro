import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { geomaticsAssistant, gisCopilot, aiStatus } from './src/server/aiService';
import {
  guardConfigFromEnv,
  guardRequest,
  securityHeaders
} from './src/server/requestGuard';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  // Bind to loopback by default. The previous 0.0.0.0 published these endpoints
  // on every interface the moment the process started, which for a server
  // holding a paid API key is a decision an operator should have to make, not
  // one they inherit. Set HOST=0.0.0.0 to publish deliberately.
  const HOST = process.env.HOST || '127.0.0.1';

  const guardCfg = guardConfigFromEnv(process.env);

  // Bounded to the guard's limit rather than 10 MB: a prompt and its workspace
  // context, and nothing like a file upload.
  app.use(express.json({ limit: guardCfg.maxBodyBytes }));

  app.use((_req, res, next) => {
    for (const [k, v] of Object.entries(securityHeaders())) res.setHeader(k, v);
    next();
  });

  /** Shared entry for both AI endpoints: guard, then run the same service the
   *  deployed serverless functions run. */
  const aiRoute = (
    run: (body: any, env: NodeJS.ProcessEnv) => Promise<{ status: number; body: Record<string, unknown> }>
  ) => async (req: express.Request, res: express.Response) => {
    const verdict = guardRequest(
      {
        method: req.method,
        origin: req.get('origin'),
        host: req.get('host'),
        authorization: req.get('authorization'),
        contentLength: Number(req.get('content-length')) || null,
        clientId: req.ip || req.socket.remoteAddress || 'unknown'
      },
      guardCfg
    );
    if (!verdict.ok) {
      if (verdict.retryAfterSeconds) res.setHeader('Retry-After', String(verdict.retryAfterSeconds));
      res.status(verdict.status).json({ error: verdict.error });
      return;
    }
    const result = await run(req.body, process.env);
    res.status(result.status).json(result.body);
  };

  // 1. Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', serverTime: new Date().toISOString() });
  });

  // 2. AI availability
  app.get('/api/ai/status', (_req, res) => {
    res.json(aiStatus(process.env));
  });

  // 3 and 4. The AI endpoints. Registered for every method so that the guard
  // answers a wrong one with 405 rather than letting it fall through to the
  // single-page-application catch-all below, which returned the app shell with
  // status 200 for a GET to an API path.
  app.all('/api/ai/geomatics-assistant', aiRoute(geomaticsAssistant));
  app.all('/api/ai/gis-copilot', aiRoute(gisCopilot));

  // Nothing else under /api/ exists. Say so in the same shape as every other
  // API response instead of serving HTML.
  app.all(/^\/api\//, (_req, res) => {
    res.status(404).json({ error: 'No such endpoint.' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Express 5 routes through path-to-regexp v8, which rejects a bare '*' as a
    // path. A regular expression is the direct equivalent for the single-page
    // application fallback: anything not served as a static file returns the
    // shell so client-side routing can take over.
    app.get(/.*/, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`BhuNex Studio server active on ${HOST}:${PORT}`);
  });
}

startServer();
