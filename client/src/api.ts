import { env } from './config';
import type { CreateOrderInput, Rates, PaymentMethod, DeliveryMethod } from '@ipe/shared';

/// Lazy-set by main.tsx after Privy mounts. The admin-flagged API calls below
/// pull the access token from this getter so we don't need to thread it through
/// react-query keys.
let privyTokenGetter: (() => Promise<string | null>) | null = null;
export function setPrivyTokenGetter(fn: () => Promise<string | null>) {
  privyTokenGetter = fn;
}

interface RequestOpts extends RequestInit {
  /// Attach the Privy access token as Bearer for admin-gated endpoints.
  admin?: boolean;
}

async function request<T>(path: string, init?: RequestOpts): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (init?.admin && privyTokenGetter) {
    const token = await privyTokenGetter();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${env.apiUrl}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: unknown };
    throw new Error(extractError(body.error, res));
  }
  return res.json() as Promise<T>;
}

/// Squeeze a useful message out of either a plain string error, a zod
/// fieldErrors blob ({ fieldErrors: { name: ['Required'] } }), or formErrors.
function extractError(error: unknown, res: Response): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const e = error as { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
    if (e.fieldErrors) {
      const lines = Object.entries(e.fieldErrors)
        .filter(([, msgs]) => msgs && msgs.length > 0)
        .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`);
      if (lines.length) return lines.join('\n');
    }
    if (e.formErrors && e.formErrors.length) return e.formErrors.join(', ');
  }
  return `${res.status} ${res.statusText}`;
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
    /// NOWPayments ticker (e.g. 'btc', 'eth', 'usdcerc20'). Required for the
    /// in-app crypto flow; omit to fall back to the hosted checkout page.
    payCurrency?: string;
    deliveryMethod: 'shipping' | 'pickup';
    shippingAddress?: unknown;
    pickup?: { eventId: string; displayName: string };
  }) =>
    request<{
      orderId: string;
      provider: 'mercadopago' | 'nowpayments';
      pix?: { qrCode: string; qrCodeBase64: string; expiresAt: string | null };
      crypto?: {
        payAddress: string;
        payAmount: number;
        payCurrency: string;
        qrCodeBase64: string;
        expiresAt: string | null;
      };
      checkoutUrl?: string;
    }>('/orders/gateway', { method: 'POST', body: JSON.stringify(input) }),
  /// Crypto coins enabled on the NOWPayments merchant account.
  cryptoCurrencies: () =>
    request<{ coins: { ticker: string; label: string }[] }>('/payment/crypto-currencies'),
  /// Local-dev only — manually mark a gateway order as paid (simulates webhook).
  devConfirmGatewayOrder: (id: string) =>
    request<{ ok: true }>(`/orders/gateway/${id}/dev-confirm`, { method: 'POST' }),

  treasury: () => request<TreasuryDTO>('/treasury'),
  rates: () => request<Rates>('/rates'),

  /// Returns 200 with admin context if the connected Privy user is an admin,
  /// 401 if no/invalid token, 403 if the user is not on the allowlist.
  adminMe: () => request<{ email: string; name: string; adminId: string }>('/admin/me', { admin: true }),

  listAdmins: () => request<AdminUserDTO[]>('/admin/admins', { admin: true }),
  addAdmin: (body: { email: string; name?: string }) =>
    request<AdminUserDTO>('/admin/admins', {
      admin: true,
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAdmin: (id: string, body: { name?: string; active?: boolean }) =>
    request<AdminUserDTO>(`/admin/admins/${id}`, {
      admin: true,
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  removeAdmin: (id: string) =>
    request<AdminUserDTO>(`/admin/admins/${id}`, { admin: true, method: 'DELETE' }),
};

export interface AdminUserDTO {
  id: string;
  email: string;
  name: string;
  active: boolean;
  createdAt: string;
}

function replacer(_key: string, value: unknown) {
  return typeof value === 'bigint' ? value.toString() : value;
}
