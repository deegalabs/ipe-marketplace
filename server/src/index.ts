import express from 'express';
import cors from 'cors';
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
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/admin', adminAuthRouter);
app.use('/products', productsRouter);
app.use('/orders', ordersRouter);
app.use('/treasury', treasuryRouter);
app.use('/rates', ratesRouter);
app.use('/', gatewayRouter);   // mounts /orders/gateway, /webhooks/*, /orders/gateway/:id/dev-confirm

app.listen(env.PORT, async () => {
  console.log(`[server] listening on :${env.PORT}`);
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
