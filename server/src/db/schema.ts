import { pgTable, uuid, text, timestamp, integer, bigint, boolean, numeric, pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const productCategory = pgEnum('product_category', ['t-shirt', 'hoodie', 'cup', 'cap', 'other']);
export const orderStatus = pgEnum('order_status', [
  'pending',
  'awaiting_payment',
  'paid',
  'shipped',
  'delivered',
  'refunded',
  'cancelled',
]);
export const paymentMethod = pgEnum('payment_method', ['ipe', 'usdc', 'pix']);
export const deliveryMethod = pgEnum('delivery_method', ['shipping', 'pickup']);

/// Helper for uint256-sized amounts that don't fit in Postgres BIGINT.
/// Returned as `string` from drizzle reads — convert with BigInt() at boundaries.
const uint256 = (name: string) => numeric(name, { precision: 78, scale: 0 });

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  /// onchain tokenId (null until admin lists it onchain)
  tokenId: bigint('token_id', { mode: 'bigint' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  category: productCategory('category').notNull(),
  imageUrl: text('image_url').notNull(),
  /// Per-currency prices in smallest unit. 0 disables that currency.
  /// Returned as string (numeric) — call BigInt() when you need math.
  priceIpe: uint256('price_ipe').notNull().default('0'),
  priceUsdc: uint256('price_usdc').notNull().default('0'),
  /// BRL stored as cents (int8 fits — even R$92 quadrilhões in cents).
  priceBrl: bigint('price_brl', { mode: 'bigint' }).notNull().default(sql`0`),
  /// 0 = unlimited
  maxSupply: uint256('max_supply').notNull().default('0'),
  royaltyBps: integer('royalty_bps').notNull().default(500),
  active: boolean('active').notNull().default(true),
  /// Off-chain warehouse stock for shipping fulfillment.
  physicalStock: integer('physical_stock').notNull().default(0),
  pickupAvailable: boolean('pickup_available').notNull().default(false),
  shippingAvailable: boolean('shipping_available').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id),
  buyerAddress: text('buyer_address').notNull(),
  quantity: integer('quantity').notNull(),
  paymentMethod: paymentMethod('payment_method').notNull(),
  /// Token contract for crypto payments. Null for PIX.
  paymentTokenAddress: text('payment_token_address'),
  /// Total paid in the chosen currency's smallest unit (numeric → string).
  totalPaid: uint256('total_paid').notNull(),
  /// txHash for crypto, Asaas paymentId for PIX.
  paymentRef: text('payment_ref'),
  blockNumber: bigint('block_number', { mode: 'bigint' }),
  status: orderStatus('status').notNull().default('pending'),
  deliveryMethod: deliveryMethod('delivery_method').notNull().default('shipping'),
  /// AES-256-GCM ciphertext (iv + tag + payload, base64). Decrypt with SHIPPING_ENCRYPTION_KEY.
  shippingAddressEnc: text('shipping_address_enc'),
  /// Plaintext (no PII concern beyond display name + free-form event id).
  pickupEventId: text('pickup_event_id'),
  pickupDisplayName: text('pickup_display_name'),
  trackingCode: text('tracking_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const indexerState = pgTable('indexer_state', {
  id: text('id').primaryKey(),
  lastBlock: bigint('last_block', { mode: 'bigint' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
