import { env } from './config';
import { getAdminToken } from './lib/adminAuth';
import type { CreateOrderInput, Rates, PaymentMethod, DeliveryMethod } from '@ipe/shared';

interface RequestOpts extends RequestInit {
  /// Attach the admin JWT from localStorage as Bearer.
  admin?: boolean;
}

async function request<T>(path: string, init?: RequestOpts): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (init?.admin) {
    const token = getAdminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${env.apiUrl}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: unknown };
    const msg = typeof body.error === 'string' ? body.error : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
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
  buyerAddress: string | null;
  customerEmail: string | null;
  quantity: number;
  paymentMethod: PaymentMethod;
  paymentProvider: 'direct' | 'mercadopago' | 'nowpayments';
  paymentTokenAddress: string | null;
  totalPaid: string;
  paymentRef: string | null;
  externalCheckoutUrl: string | null;
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
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
    request<ProductDTO>('/products', { admin: true, method: 'POST', body: JSON.stringify(body, replacer) }),
  updateProduct: (id: string, body: unknown) =>
    request<ProductDTO>(`/products/${id}`, { admin: true, method: 'PATCH', body: JSON.stringify(body, replacer) }),
  setProductTokenId: (id: string, tokenId: bigint) =>
    request<ProductDTO>(`/products/${id}/token`, {
      admin: true,
      method: 'POST',
      body: JSON.stringify({ tokenId: tokenId.toString() }),
    }),

  createOrder: (input: CreateOrderInput) =>
    request<OrderDTO>('/orders', { method: 'POST', body: JSON.stringify(input, replacer) }),
  ordersByBuyer: (address: string) =>
    request<OrderDTO[]>(`/orders/by-buyer/${address.toLowerCase()}`),
  getOrder: (id: string) => request<OrderDTO>(`/orders/${id}`),
  adminOrders: () => request<OrderDTO[]>('/orders/admin', { admin: true }),
  updateOrder: (id: string, body: { status?: string; trackingCode?: string }) =>
    request<OrderDTO>(`/orders/admin/${id}`, { admin: true, method: 'PATCH', body: JSON.stringify(body) }),

  /// Gateway checkout (Mercado Pago PIX or NOWPayments crypto-gateway).
  createGatewayOrder: (input: {
    productId: string;
    customerEmail: string;
    buyerAddress?: string;
    quantity: number;
    paymentMethod: 'pix' | 'crypto-gateway';
    deliveryMethod: 'shipping' | 'pickup';
    shippingAddress?: unknown;
    pickup?: { eventId: string; displayName: string };
  }) =>
    request<{
      orderId: string;
      provider: 'mercadopago' | 'nowpayments';
      pix?: { qrCode: string; qrCodeBase64: string; expiresAt: string | null };
      checkoutUrl?: string;
    }>('/orders/gateway', { method: 'POST', body: JSON.stringify(input) }),
  /// Local-dev only — manually mark a gateway order as paid (simulates webhook).
  devConfirmGatewayOrder: (id: string) =>
    request<{ ok: true }>(`/orders/gateway/${id}/dev-confirm`, { method: 'POST' }),

  treasury: () => request<TreasuryDTO>('/treasury'),
  rates: () => request<Rates>('/rates'),
};

function replacer(_key: string, value: unknown) {
  return typeof value === 'bigint' ? value.toString() : value;
}
