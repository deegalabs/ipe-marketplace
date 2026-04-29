import { env } from './config';
import type { CreateOrderInput, Rates, PaymentMethod, DeliveryMethod } from '@ipe/shared';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.apiUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export interface ProductDTO {
  id: string;
  tokenId: string | null;
  name: string;
  description: string;
  category: string;
  imageUrl: string;
  /// Smallest-unit prices as strings (since they may exceed Number.MAX_SAFE_INTEGER).
  priceIpe: string;
  priceUsdc: string;
  priceBrl: string;     // BRL cents
  maxSupply: string;
  royaltyBps: number;
  active: boolean;
  physicalStock: number;
  pickupAvailable: boolean;
  shippingAvailable: boolean;
}

export interface OrderDTO {
  id: string;
  productId: string;
  buyerAddress: string;
  quantity: number;
  paymentMethod: PaymentMethod;
  paymentTokenAddress: string | null;
  totalPaid: string;
  paymentRef: string | null;
  blockNumber: string | null;
  status: 'pending' | 'awaiting_payment' | 'paid' | 'shipped' | 'delivered' | 'refunded' | 'cancelled';
  deliveryMethod: DeliveryMethod;
  shippingAddress: unknown;
  pickup: { eventId: string; displayName: string } | null;
  trackingCode: string | null;
  createdAt: string;
}

export interface TreasuryDTO {
  treasuryAddress: string;
  balances: Array<{
    symbol: string;
    decimals: number;
    location: 'treasury' | 'contract';
    balance: string;
  }>;
}

export const api = {
  listProducts: () => request<ProductDTO[]>('/products'),
  getProduct: (id: string) => request<ProductDTO>(`/products/${id}`),
  createProduct: (body: unknown) =>
    request<ProductDTO>('/products', { method: 'POST', body: JSON.stringify(body, replacer) }),
  updateProduct: (id: string, body: unknown) =>
    request<ProductDTO>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(body, replacer) }),
  setProductTokenId: (id: string, tokenId: bigint) =>
    request<ProductDTO>(`/products/${id}/token`, {
      method: 'POST',
      body: JSON.stringify({ tokenId: tokenId.toString() }),
    }),

  createOrder: (input: CreateOrderInput) =>
    request<OrderDTO>('/orders', { method: 'POST', body: JSON.stringify(input, replacer) }),
  ordersByBuyer: (address: string) =>
    request<OrderDTO[]>(`/orders/by-buyer/${address.toLowerCase()}`),
  adminOrders: () => request<OrderDTO[]>('/orders/admin'),
  updateOrder: (id: string, body: { status?: string; trackingCode?: string }) =>
    request<OrderDTO>(`/orders/admin/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  treasury: () => request<TreasuryDTO>('/treasury'),
  rates: () => request<Rates>('/rates'),
};

function replacer(_key: string, value: unknown) {
  return typeof value === 'bigint' ? value.toString() : value;
}
