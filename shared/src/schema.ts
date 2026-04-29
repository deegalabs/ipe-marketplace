import { z } from 'zod';

export const productCategoryEnum = z.enum(['t-shirt', 'hoodie', 'cup', 'cap', 'other']);
export type ProductCategory = z.infer<typeof productCategoryEnum>;

/// A product as it lives in the off-chain catalog. `tokenId` is null until the
/// admin pushes it onchain via listProduct().
export const productSchema = z.object({
  id: z.string().uuid(),
  tokenId: z.bigint().nullable(),
  name: z.string().min(1).max(120),
  description: z.string().max(2_000).default(''),
  category: productCategoryEnum,
  imageUrl: z.string().url(),
  priceIpe: z.bigint(),               // smallest unit
  maxSupply: z.bigint(),              // 0 = unlimited
  royaltyBps: z.number().int().min(0).max(1_000),
  active: z.boolean(),
  physicalStock: z.number().int().min(0),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Product = z.infer<typeof productSchema>;

/// What the admin POSTs to create / update a product (no derived fields).
export const productInputSchema = productSchema
  .pick({
    name: true,
    description: true,
    category: true,
    imageUrl: true,
    priceIpe: true,
    maxSupply: true,
    royaltyBps: true,
    physicalStock: true,
  })
  .extend({ active: z.boolean().default(true) });
export type ProductInput = z.infer<typeof productInputSchema>;

export const orderStatusEnum = z.enum(['pending', 'paid', 'shipped', 'delivered', 'refunded', 'cancelled']);
export type OrderStatus = z.infer<typeof orderStatusEnum>;

export const shippingAddressSchema = z.object({
  fullName: z.string().min(2).max(120),
  line1: z.string().min(2).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(120),
  state: z.string().min(1).max(60),
  postalCode: z.string().min(3).max(20),
  country: z.string().length(2),       // ISO-3166-1 alpha-2
  phone: z.string().max(40).optional(),
});
export type ShippingAddress = z.infer<typeof shippingAddressSchema>;

export const orderSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  buyerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  quantity: z.number().int().positive(),
  totalPaidIpe: z.bigint(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).nullable(),
  blockNumber: z.bigint().nullable(),
  status: orderStatusEnum,
  /// Stored encrypted at rest; surfaced to admin only.
  shippingAddress: shippingAddressSchema.nullable(),
  trackingCode: z.string().max(120).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Order = z.infer<typeof orderSchema>;

export const createOrderInputSchema = z.object({
  productId: z.string().uuid(),
  buyerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  quantity: z.number().int().positive(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  shippingAddress: shippingAddressSchema,
});
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
