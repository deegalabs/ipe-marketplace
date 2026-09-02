import { and, eq, gte, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';

/// Atomically reserve `qty` units of physical stock for a product. The
/// conditional UPDATE only matches when there is enough stock, so concurrent
/// buyers can't oversubscribe the same units. Returns true if reserved, false
/// if there wasn't enough (no row matched).
export async function reserveStock(productId: string, qty: number): Promise<boolean> {
  const rows = await db
    .update(schema.products)
    .set({ physicalStock: sql`${schema.products.physicalStock} - ${qty}` })
    .where(and(eq(schema.products.id, productId), gte(schema.products.physicalStock, qty)))
    .returning({ id: schema.products.id });
  return rows.length > 0;
}

/// Return `qty` units to stock. Called when a stock-holding order is released
/// before fulfillment (cancelled, expired, or refunded pre-delivery). Callers
/// gate this on a race-safe status transition so it runs at most once per order.
export async function restoreStock(productId: string, qty: number): Promise<void> {
  await db
    .update(schema.products)
    .set({ physicalStock: sql`${schema.products.physicalStock} + ${qty}` })
    .where(eq(schema.products.id, productId));
}
