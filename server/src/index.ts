import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './env.js';
import { productsRouter } from './routes/products.js';
import { ordersRouter } from './routes/orders.js';
import { treasuryRouter } from './routes/treasury.js';
import { ratesRouter } from './routes/rates.js';
import { gatewayRouter } from './routes/gateway.js';
import { adminAuthRouter } from './routes/admin-auth.js';
import { startIndexer } from './indexer.js';
import { ensureBootstrapAdmin } from './services/auth.js';

const app = express();

/// Trust the first proxy (Railway / Vercel / Cloudflare) so req.ip reads from
/// X-Forwarded-For instead of the proxy IP. Required for IP-based rate limiting
/// to actually segment by client IP.
app.set('trust proxy', 1);

app.use(
  helmet({
    // The frontend lives on a different origin (Vercel), so default CSP is too
    // strict for an API-only role. We rely on the frontend host (Vercel) for
    // CSP on the HTML it serves. Backend just needs the basics.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

/// CORS allowlist — only the deployed frontend can hit the API. In dev we also
/// allow the Vite dev server origin and the LAN IP variants.
const allowedOrigins = new Set<string>([env.PUBLIC_APP_URL]);
if (env.NODE_ENV !== 'production') {
  allowedOrigins.add('http://localhost:5173');
  allowedOrigins.add('http://localhost:5174');
}
app.use(
  cors({
    origin(origin, cb) {
      // Same-origin / curl / health probes have no Origin header — let through.
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      // Allow any LAN IP in dev so phones on the wifi can hit the API.
      if (env.NODE_ENV !== 'production' && /^https?:\/\/(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\./.test(origin)) {
        return cb(null, true);
      }
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
  }),
);

app.use(express.json({ limit: '1mb' }));

/// Global rate limit — 60 req/min/IP across the API. Webhooks and the health
/// probe are exempt (providers can burst, monitors poll often).
const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || req.path.startsWith('/webhooks/'),
  message: { error: 'too many requests, slow down' },
});
app.use(globalLimiter);

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/admin', adminAuthRouter);
app.use('/products', productsRouter);
app.use('/orders', ordersRouter);
app.use('/treasury', treasuryRouter);
app.use('/rates', ratesRouter);
app.use('/', gatewayRouter);   // mounts /orders/gateway, /webhooks/*, /orders/gateway/:id/dev-confirm

/// CORS rejections (origin not in allowlist) bubble up as Errors with a
/// "CORS:" prefix from the middleware above. Catch them here so curl/browser
/// see a clean 403 instead of an internal 500.
app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({ error: 'origin not allowed' });
  }
  next(err);
});

// Bind to 0.0.0.0 explicitly — required for Railway/Render/etc. to route the
// public URL into the container. Defaulting to localhost would silently break
// healthchecks even though the process is "up".
app.listen(Number(env.PORT), '0.0.0.0', async () => {
  console.log(`[server] listening on 0.0.0.0:${env.PORT} (env=${env.NODE_ENV})`);
  try {
    await ensureBootstrapAdmin();
  } catch (err) {
    console.error('[server] bootstrap admin failed', err);
  }
  if (!env.DISABLE_INDEXER) {
    startIndexer();
  } else {
    console.log('[indexer] disabled via DISABLE_INDEXER');
  }
});
