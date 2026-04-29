import { z } from 'zod';

export const productCategoryEnum = z.enum(['t-shirt', 'hoodie', 'cup', 'cap', 'other']);
export type ProductCategory = z.infer<typeof productCategoryEnum>;

export const paymentMethodEnum = z.enum(['ipe', 'usdc', 'pix', 'crypto-gateway']);
export type PaymentMethod = z.infer<typeof paymentMethodEnum>;

export const paymentProviderEnum = z.enum(['direct', 'mercadopago', 'nowpayments']);
export type PaymentProvider = z.infer<typeof paymentProviderEnum>;

export const deliveryMethodEnum = z.enum(['shipping', 'pickup']);
export type DeliveryMethod = z.infer<typeof deliveryMethodEnum>;

/// A product as it lives in the off-chain catalog. `tokenId` is null until the
/// admin pushes it onchain via listProduct().
export const productSchema = z.object({
  id: z.string().uuid(),
  tokenId: z.bigint().nullable(),
  name: z.string().min(1).max(120),
  description: z.string().max(2_000).default(''),
  category: productCategoryEnum,
  imageUrl: z.string().url(),
  /// Per-currency prices in smallest unit. priceBrl is fiat (cents — int with no decimal).
  /// Setting a price to 0n disables that currency for this product.
  priceIpe: z.bigint(),     // 18 decimals
  priceUsdc: z.bigint(),    // 6 decimals
  priceBrl: z.bigint(),     // BRL cents (e.g. 12500 = R$ 125,00)
  maxSupply: z.bigint(),
  royaltyBps: z.number().int().min(0).max(1_000),
  active: z.boolean(),
  physicalStock: z.number().int().min(0),
  /// When true, buyer picks up the item at an event (no shipping address required).
  pickupAvailable: z.boolean(),
  /// When true, buyer can ship the item to themselves (default).
  shippingAvailable: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Product = z.infer<typeof productSchema>;

export const productInputSchema = productSchema
  .pick({
    name: true,
    description: true,
    category: true,
    imageUrl: true,
    priceIpe: true,
    priceUsdc: true,
    priceBrl: true,
    maxSupply: true,
    royaltyBps: true,
    physicalStock: true,
    pickupAvailable: true,
    shippingAvailable: true,
  })
  .extend({ active: z.boolean().default(true) });
export type ProductInput = z.infer<typeof productInputSchema>;

export const orderStatusEnum = z.enum([
  'pending',           // order recorded, payment not yet confirmed
  'awaiting_payment',  // PIX QR generated, waiting for PSP webhook
  'paid',              // payment confirmed (onchain or fiat)
  'shipped',
  'delivered',
  'refunded',
  'cancelled',
]);
export type OrderStatus = z.infer<typeof orderStatusEnum>;

export const shippingAddressSchema = z.object({
  fullName: z.string().min(2).max(120),
  line1: z.string().min(2).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(120),
  state: z.string().min(1).max(60),
  postalCode: z.string().min(3).max(20),
  country: z.string().length(2),
  phone: z.string().max(40).optional(),
});
export type ShippingAddress = z.infer<typeof shippingAddressSchema>;

export const pickupInfoSchema = z.object({
  /// Free-form event identifier set by the admin per-product (e.g. "ipe-meetup-2026-05").
  eventId: z.string().max(120),
  /// Buyer-supplied display name for verification at pickup.
  displayName: z.string().min(1).max(120),
});
export type PickupInfo = z.infer<typeof pickupInfoSchema>;

export const orderSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  /// Optional — null for gateway flows where the buyer didn't provide a wallet.
  buyerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).nullable(),
  customerEmail: z.string().email().nullable(),
  quantity: z.number().int().positive(),
  paymentMethod: paymentMethodEnum,
  paymentProvider: paymentProviderEnum,
  /// Token contract address for direct crypto payments.
  paymentTokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).nullable(),
  totalPaid: z.bigint(),
  /// txHash (direct), Mercado Pago paymentId (PIX), or NOWPayments invoiceId (gateway).
  paymentRef: z.string().nullable(),
  /// NOWPayments hosted checkout URL (only set for crypto-gateway flows).
  externalCheckoutUrl: z.string().url().nullable(),
  /// Mercado Pago PIX payload (so the client can re-render the QR).
  pixQrCode: z.string().nullable(),
  pixQrCodeBase64: z.string().nullable(),
  blockNumber: z.bigint().nullable(),
  status: orderStatusEnum,
  deliveryMethod: deliveryMethodEnum,
  shippingAddress: shippingAddressSchema.nullable(),
  pickup: pickupInfoSchema.nullable(),
  trackingCode: z.string().max(120).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Order = z.infer<typeof orderSchema>;

/// POST /orders — used after a *direct onchain* purchase (buyer signed buy() themselves).
/// The order is recorded as already paid via the indexer once the Purchased event lands.
export const createDirectOrderInputSchema = z
  .object({
    productId: z.string().uuid(),
    buyerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    customerEmail: z.string().email().optional(),
    quantity: z.number().int().positive(),
    paymentMethod: z.enum(['ipe', 'usdc']),
    paymentTokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    paymentRef: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    deliveryMethod: deliveryMethodEnum,
    shippingAddress: shippingAddressSchema.optional(),
    pickup: pickupInfoSchema.optional(),
  })
  .refine((d) => d.deliveryMethod === 'pickup' || d.shippingAddress, {
    message: 'shippingAddress is required when deliveryMethod = shipping',
  })
  .refine((d) => d.deliveryMethod === 'shipping' || d.pickup, {
    message: 'pickup is required when deliveryMethod = pickup',
  });
export type CreateDirectOrderInput = z.infer<typeof createDirectOrderInputSchema>;

/// POST /orders/gateway — buyer pays via Mercado Pago (PIX) or NOWPayments (crypto).
/// Email is required so we can deliver the receipt; wallet is optional. When provided,
/// the backend mints the 1155 to it on payment confirmation; otherwise the order lives
/// only in the DB.
export const createGatewayOrderInputSchema = z
  .object({
    productId: z.string().uuid(),
    customerEmail: z.string().email(),
    buyerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
    quantity: z.number().int().positive(),
    /// 'pix' → Mercado Pago. 'crypto-gateway' → NOWPayments.
    paymentMethod: z.enum(['pix', 'crypto-gateway']),
    deliveryMethod: deliveryMethodEnum,
    shippingAddress: shippingAddressSchema.optional(),
    pickup: pickupInfoSchema.optional(),
  })
  .refine((d) => d.deliveryMethod === 'pickup' || d.shippingAddress, {
    message: 'shippingAddress is required when deliveryMethod = shipping',
  })
  .refine((d) => d.deliveryMethod === 'shipping' || d.pickup, {
    message: 'pickup is required when deliveryMethod = pickup',
  });
export type CreateGatewayOrderInput = z.infer<typeof createGatewayOrderInputSchema>;

/// Backwards-compat alias used by older client code paths until they migrate.
export const createOrderInputSchema = createDirectOrderInputSchema;
export type CreateOrderInput = CreateDirectOrderInput;

/// Fiat / token rates returned by GET /rates. All values are decimal strings
/// (e.g. "5.30" for USD/BRL) — let the UI pick its own number formatting.
export const ratesSchema = z.object({
  ipeUsd: z.string().nullable(),
  ipeBrl: z.string().nullable(),
  usdcBrl: z.string().nullable(),  // ~ USD/BRL since USDC is pegged
  fetchedAt: z.string(),           // ISO timestamp
  source: z.string(),              // e.g. "coingecko" or "manual"
});
export type Rates = z.infer<typeof ratesSchema>;
