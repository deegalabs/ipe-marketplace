import { and, inArray, lt } from 'drizzle-orm';
import { db, schema } from '../db/client.js';

/// Auto-cancel orders that have been sitting in 'pending' or 'awaiting_payment'
/// past the TTL. The interval is conservative because both PSPs we use have
/// shorter quote/QR validity windows:
///   • NOWPayments direct payment quote: ~20 min
///   • Mercado Pago PIX QR: ~30 min by default
/// We wait 60 min from order creation so that any *legitimately* delayed
/// webhook still has time to land and claim the order before we cancel — better
/// to leave a stale row a few extra minutes than to cancel a paid order.
///
/// Race safety: the cancel UPDATE filters by `status IN (pending, awaiting_payment)`,
/// so a webhook that flips status to 'paid' in the same instant simply leaves
/// no rows matching — the sweeper update is a no-op for that order.

const STALE_TTL_MS = 60 * 60_000;       // 60 minutes
const SWEEP_INTERVAL_MS = 10 * 60_000;  // every 10 minutes

export function startOrderSweeper() {
  // First run after the interval, not at boot — gives the rest of startup
  // (db migrations, indexer warmup) breathing room.
  setInterval(() => {
    void sweepStaleOrders();
  }, SWEEP_INTERVAL_MS);
  console.log(`[order-sweeper] started — TTL=${STALE_TTL_MS / 60_000}min, interval=${SWEEP_INTERVAL_MS / 60_000}min`);
}

async function sweepStaleOrders() {
  try {
    const cutoff = new Date(Date.now() - STALE_TTL_MS);
    const cancelled = await db
      .update(schema.orders)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          inArray(schema.orders.status, ['pending', 'awaiting_payment'] as const),
          lt(schema.orders.createdAt, cutoff),
        ),
      )
      .returning({ id: schema.orders.id });
    if (cancelled.length > 0) {
      console.log(`[order-sweeper] auto-cancelled ${cancelled.length} stale order(s):`, cancelled.map((o) => o.id).join(', '));
    }
  } catch (err) {
    console.error('[order-sweeper] sweep failed', err);
  }
}
