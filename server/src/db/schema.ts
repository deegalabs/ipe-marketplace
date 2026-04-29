import { pgTable, uuid, text, timestamp, integer, bigint, boolean, pgEnum } from 'drizzle-orm/pg-core';

export const productCategory = pgEnum('product_category', ['t-shirt', 'hoodie', 'cup', 'cap', 'other']);
export const orderStatus = pgEnum('order_status', ['pending', 'paid', 'shipped', 'delivered', 'refunded', 'cancelled']);

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  /// onchain tokenId (null until admin lists it onchain)
  tokenId: bigint('token_id', { mode: 'bigint' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  category: productCategory('category').notNull(),
  imageUrl: text('image_url').notNull(),
  /// IPE smallest unit (uint256, stored as numeric)
  priceIpe: bigint('price_ipe', { mode: 'bigint' }).notNull(),
  /// 0 = unlimited
  maxSupply: bigint('max_supply', { mode: 'bigint' }).notNull().default(0n),
  royaltyBps: integer('royalty_bps').notNull().default(500),
  active: boolean('active').notNull().default(true),
  /// physical inventory in the warehouse, tracked off-chain
  physicalStock: integer('physical_stock').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id),
  buyerAddress: text('buyer_address').notNull(),
  quantity: integer('quantity').notNull(),
  totalPaidIpe: bigint('total_paid_ipe', { mode: 'bigint' }).notNull(),
  txHash: text('tx_hash'),
  blockNumber: bigint('block_number', { mode: 'bigint' }),
  status: orderStatus('status').notNull().default('pending'),
  /// AES-256-GCM ciphertext (iv + tag + payload, base64). Decrypt with SHIPPING_ENCRYPTION_KEY.
  shippingAddressEnc: text('shipping_address_enc'),
  trackingCode: text('tracking_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/// Tracks the last block the indexer has scanned, so restarts pick up where they stopped.
export const indexerState = pgTable('indexer_state', {
  id: text('id').primaryKey(),                           // e.g. 'purchased'
  lastBlock: bigint('last_block', { mode: 'bigint' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
