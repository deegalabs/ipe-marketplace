import express from 'express';
import cors from 'cors';
import { env } from './env.js';
import { productsRouter } from './routes/products.js';
import { ordersRouter } from './routes/orders.js';
import { treasuryRouter } from './routes/treasury.js';
import { ratesRouter } from './routes/rates.js';
import { startIndexer } from './indexer.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/products', productsRouter);
app.use('/orders', ordersRouter);
app.use('/treasury', treasuryRouter);
app.use('/rates', ratesRouter);

app.listen(env.PORT, () => {
  console.log(`[server] listening on :${env.PORT}`);
  startIndexer();
});
