import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePublicClient, useWriteContract } from 'wagmi';
import { formatUnits, parseUnits, decodeEventLog, type Hex } from 'viem';
import { IpeMarketAbi } from '@ipe/shared';
import { usePrivy } from '@privy-io/react-auth';
import { api, type ProductDTO, type OrderDTO, type AdminUserDTO } from '../api';
import { env } from '../config';
import { formatToken, formatBrl } from '../lib/format';
import { normalizeImageUrl } from '../lib/imageUrl';
import { useToast } from '../lib/toast';
import { SkeletonBox, SkeletonText } from '../components/Skeleton';

export function Admin() {
  const { user, logout } = usePrivy();
  const meQ = useQuery({ queryKey: ['admin-me'], queryFn: api.adminMe });
  const treasuryQ = useQuery({
    queryKey: ['treasury'],
    queryFn: api.treasury,
    refetchInterval: 30_000,
    // Treasury fetch hits chain — gracefully missing if contracts aren't deployed.
    retry: false,
  });
  const productsQ = useQuery({ queryKey: ['products'], queryFn: api.listProducts });
  const ordersQ = useQuery({ queryKey: ['admin-orders'], queryFn: api.adminOrders });

  return (
    <section className="space-y-10">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-ipe-green">Admin</h1>
          <p className="text-sm text-ipe-ink/60">
            Signed in as {meQ.data?.email ?? user?.email?.address ?? '—'}
          </p>
        </div>
        <button onClick={logout} className="btn-ghost text-xs">Sign out</button>
      </header>

      <TreasuryCard data={treasuryQ.data} loading={treasuryQ.isLoading} />
      <ProductsCard products={productsQ.data ?? []} loading={productsQ.isLoading} />
      <OrdersCard orders={ordersQ.data ?? []} products={productsQ.data ?? []} loading={ordersQ.isLoading} />
      <AdminsCard currentAdminId={meQ.data?.adminId} />
    </section>
  );
}

function TreasuryCard({ data, loading }: { data: Awaited<ReturnType<typeof api.treasury>> | undefined; loading: boolean }) {
  if (loading && !data) {
    return (
      <div className="card p-5 space-y-3">
        <SkeletonBox className="h-7 w-32" />
        <SkeletonText className="w-2/3" />
        <div className="space-y-2 pt-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex gap-4 items-center">
              <SkeletonText className="w-16" />
              <SkeletonText className="flex-1" />
              <SkeletonText className="w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!data) return null;
  const fmt = (b: { symbol: string; decimals: number; balance: string }) =>
    `${(Number(b.balance) / 10 ** b.decimals).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${b.symbol}`;
  return (
    <div className="card p-5">
      <h2 className="text-xl font-semibold text-ipe-green mb-3">Treasury</h2>
      <p className="text-xs text-ipe-ink/60 font-mono break-all mb-3">{data.treasuryAddress}</p>
      <div className="table-wrap">
      <table className="w-full text-sm">
        <thead className="text-left text-ipe-ink/60">
          <tr><th>Token</th><th>Treasury</th><th>In contract (orphan)</th></tr>
        </thead>
        <tbody>
          {[...new Set(data.balances.map((b) => b.symbol))].map((sym) => {
            const t = data.balances.find((b) => b.symbol === sym && b.location === 'treasury');
            const c = data.balances.find((b) => b.symbol === sym && b.location === 'contract');
            return (
              <tr key={sym} className="border-t border-ipe-green/10">
                <td className="py-2 font-medium">{sym}</td>
                <td>{t ? fmt(t) : '—'}</td>
                <td>{c ? fmt(c) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

interface ProductDraft {
  name: string;
  description: string;
  category: 't-shirt' | 'hoodie' | 'cup' | 'cap' | 'other';
  imageUrl: string;
  /// Single canonical price in USD (human input, e.g. "29.90"). Stored as
  /// priceUsdc on save; PIX/BRL conversion happens live at checkout via the
  /// rates endpoint, so admins don't have to maintain three numbers.
  priceUsd: string;
  maxSupply: string;
  royaltyBps: number;
  physicalStock: number;
  pickupAvailable: boolean;
  shippingAvailable: boolean;
}

const EMPTY_DRAFT: ProductDraft = {
  name: '',
  description: '',
  category: 't-shirt',
  imageUrl: '',
  priceUsd: '',
  maxSupply: '0',
  royaltyBps: 500,
  physicalStock: 0,
  pickupAvailable: true,
  shippingAvailable: false,
};

function draftFromProduct(p: ProductDTO): ProductDraft {
  return {
    name: p.name,
    description: p.description,
    category: p.category as ProductDraft['category'],
    imageUrl: p.imageUrl,
    priceUsd: BigInt(p.priceUsdc) > 0n ? formatUnits(BigInt(p.priceUsdc), 6) : '',
    maxSupply: p.maxSupply,
    royaltyBps: p.royaltyBps,
    physicalStock: p.physicalStock,
    pickupAvailable: p.pickupAvailable,
    shippingAvailable: p.shippingAvailable,
  };
}

function ProductsCard({ products, loading }: { products: ProductDTO[]; loading: boolean }) {
  const qc = useQueryClient();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  /// null = closed, 'new' = creating, '<uuid>' = editing that product
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  async function pushOnchain(p: ProductDTO) {
    if (!publicClient) return;
    setBusyId(p.id);
    try {
      const tokens: `0x${string}`[] = [];
      const prices: bigint[] = [];
      if (BigInt(p.priceIpe) > 0n) { tokens.push(env.ipeToken); prices.push(BigInt(p.priceIpe)); }
      if (BigInt(p.priceUsdc) > 0n) { tokens.push(env.usdcToken); prices.push(BigInt(p.priceUsdc)); }

      const hash = await writeContractAsync({
        address: env.ipeMarket,
        abi: IpeMarketAbi,
        functionName: 'listProduct',
        args: [BigInt(p.maxSupply), BigInt(p.royaltyBps), p.imageUrl, tokens, prices],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      let tokenId: bigint | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: IpeMarketAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
          if (decoded.eventName === 'ProductListed') {
            tokenId = (decoded.args as { productId: bigint }).productId;
            break;
          }
        } catch { /* skip non-matching logs */ }
      }
      if (tokenId !== null) {
        await api.setProductTokenId(p.id, tokenId);
        await qc.invalidateQueries({ queryKey: ['products'] });
        toast.success('Pushed onchain', `${p.name} → tokenId #${tokenId}`);
      } else {
        toast.error('Push failed', 'Transaction succeeded but no ProductListed event detected');
      }
    } catch (err) {
      toast.error('Push onchain failed', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  /// Push the off-chain price for a single token to the contract via setPrice.
  /// Reads the current DB value (in smallest unit) and sends it. Owner-only onchain.
  async function syncPriceOnchain(p: ProductDTO, token: 'ipe' | 'usdc') {
    if (!publicClient || !p.tokenId) return;
    const tokenAddr = token === 'ipe' ? env.ipeToken : env.usdcToken;
    const newPrice = BigInt(token === 'ipe' ? p.priceIpe : p.priceUsdc);
    setBusyId(p.id);
    try {
      const hash = await writeContractAsync({
        address: env.ipeMarket,
        abi: IpeMarketAbi,
        functionName: 'setPrice',
        args: [BigInt(p.tokenId), tokenAddr, newPrice],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      toast.success(`${token.toUpperCase()} price synced`, p.name);
    } catch (err) {
      toast.error('Sync failed', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold text-ipe-green">Products</h2>
        {editing === null && (
          <button className="btn-ghost text-xs" onClick={() => setEditing('new')}>+ New product</button>
        )}
      </div>

      {loading && products.length === 0 && <TableRowsSkeleton rows={3} cols={5} />}

      {editing !== null && (
        <ProductForm
          mode={editing === 'new' ? 'new' : 'edit'}
          initial={editing === 'new' ? EMPTY_DRAFT : draftFromProduct(products.find((p) => p.id === editing)!)}
          targetId={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await qc.invalidateQueries({ queryKey: ['products'] });
            setEditing(null);
          }}
        />
      )}

      {/* Mobile: stacked cards. Desktop: table. */}
      <ul className="sm:hidden space-y-3 mt-4">
        {products.map((p) => (
          <li key={p.id} className="border border-ipe-green/10 rounded-md p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-ipe-ink/60">
                  {p.tokenId ? <span className="text-green-700">onchain #{p.tokenId}</span> : <span className="text-amber-700">offline</span>}
                  {' · stock '}{p.physicalStock}{p.active ? '' : ' · inactive'}
                </p>
              </div>
              <button className="btn-ghost text-xs" onClick={() => setEditing(p.id)} disabled={busyId === p.id}>
                Edit
              </button>
            </div>
            <p className="text-sm mt-2">
              <span className="text-ipe-ink/50 text-xs uppercase tracking-wider mr-1">USD</span>
              {BigInt(p.priceUsdc) > 0n ? `$${(Number(p.priceUsdc) / 1e6).toFixed(2)}` : '—'}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {!p.tokenId && (
                <button className="btn-ghost text-xs" disabled={busyId === p.id} onClick={() => pushOnchain(p)}>
                  {busyId === p.id ? 'Pushing…' : 'Push onchain'}
                </button>
              )}
              {p.tokenId && BigInt(p.priceUsdc) > 0n && (
                <button className="btn-ghost text-xs" disabled={busyId === p.id} onClick={() => syncPriceOnchain(p, 'usdc')}>
                  Sync USDC
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden sm:block table-wrap mt-4">
        <table className="w-full text-sm">
          <thead className="text-left text-ipe-ink/60">
            <tr>
              <th className="py-2">Product</th>
              <th>Onchain</th>
              <th>Price (USD)</th>
              <th>Stock</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-ipe-green/10">
                <td className="py-2">{p.name}</td>
                <td>{p.tokenId ? <span className="text-green-700">#{p.tokenId}</span> : <span className="text-amber-700">offline</span>}</td>
                <td>{BigInt(p.priceUsdc) > 0n ? `$${(Number(p.priceUsdc) / 1e6).toFixed(2)}` : '—'}</td>
                <td>{p.physicalStock}</td>
                <td>{p.active ? '✓' : '—'}</td>
                <td className="space-x-2 whitespace-nowrap">
                  <button className="btn-ghost text-xs" onClick={() => setEditing(p.id)} disabled={busyId === p.id}>
                    Edit
                  </button>
                  {!p.tokenId && (
                    <button className="btn-ghost text-xs" disabled={busyId === p.id} onClick={() => pushOnchain(p)}>
                      {busyId === p.id ? 'Pushing…' : 'Push onchain'}
                    </button>
                  )}
                  {p.tokenId && BigInt(p.priceUsdc) > 0n && (
                    <button className="btn-ghost text-xs" disabled={busyId === p.id} onClick={() => syncPriceOnchain(p, 'usdc')}>
                      Sync USDC
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface ProductFormProps {
  mode: 'new' | 'edit';
  initial: ProductDraft;
  /// product UUID when editing, null when creating
  targetId: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

function ProductForm({ mode, initial, targetId, onClose, onSaved }: ProductFormProps) {
  const toast = useToast();
  const [draft, setDraft] = useState<ProductDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!draft.name.trim()) {
      setError('Product name is required.');
      toast.error('Missing name', 'Enter a product name before saving.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const { priceUsd, ...rest } = draft;
      const body = {
        ...rest,
        name: draft.name.trim(),
        description: draft.description?.trim() ?? '',
        imageUrl: draft.imageUrl?.trim() ?? '',
        priceUsdc: parseUnits(priceUsd || '0', 6).toString(),
        priceIpe: '0',
        priceBrl: '0',
        maxSupply: draft.maxSupply || '0',
      };
      if (mode === 'new') {
        await api.createProduct({ ...body, active: true });
        toast.success('Product created', body.name);
      } else {
        await api.updateProduct(targetId!, body);
        toast.success('Product updated', body.name);
      }
      await onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'save failed';
      setError(msg);
      toast.error('Could not save product', msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-ipe-green/20 rounded-md p-4 bg-ipe-green/5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-ipe-green">{mode === 'new' ? 'New product' : 'Edit product'}</h3>
        <button className="text-xs text-ipe-ink/60 hover:text-ipe-ink" onClick={onClose}>cancel</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input className="input" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <ImageUrlField value={draft.imageUrl} onChange={(v) => setDraft({ ...draft, imageUrl: v })} />
        <input className="input sm:col-span-2" placeholder="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <select className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as ProductDraft['category'] })}>
          <option value="t-shirt">t-shirt</option>
          <option value="hoodie">hoodie</option>
          <option value="cup">cup</option>
          <option value="cap">cap</option>
          <option value="other">other</option>
        </select>
        <input className="input" placeholder="Max supply (0 = ∞)" value={draft.maxSupply} onChange={(e) => setDraft({ ...draft, maxSupply: e.target.value })} />

        <div className="sm:col-span-2">
          <label className="label">Price (USD)</label>
          <input
            className="input"
            type="number"
            step="0.01"
            placeholder="29.90"
            value={draft.priceUsd}
            onChange={(e) => setDraft({ ...draft, priceUsd: e.target.value })}
          />
          <p className="text-[11px] text-ipe-ink-50 mt-1">
            One canonical price. Crypto pays at this USDC amount; PIX is converted to BRL live at checkout via CoinGecko.
          </p>
        </div>

        <input className="input" type="number" placeholder="Royalty bps" value={draft.royaltyBps} onChange={(e) => setDraft({ ...draft, royaltyBps: Number(e.target.value) })} />
        <input className="input" type="number" placeholder="Physical stock" value={draft.physicalStock} onChange={(e) => setDraft({ ...draft, physicalStock: Number(e.target.value) })} />

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.shippingAvailable} onChange={(e) => setDraft({ ...draft, shippingAvailable: e.target.checked })} />
          Allow shipping
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.pickupAvailable} onChange={(e) => setDraft({ ...draft, pickupAvailable: e.target.checked })} />
          Allow event pickup
        </label>

        {error && <p className="sm:col-span-2 text-sm text-red-700">{error}</p>}
        <button className="btn-primary sm:col-span-2" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : mode === 'new' ? 'Create product' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

function OrdersCard({ orders, products, loading }: { orders: OrderDTO[]; products: ProductDTO[]; loading: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const productById = new Map(products.map((p) => [p.id, p] as const));

  async function setStatus(id: string, status: string) {
    try {
      await api.updateOrder(id, { status });
      await qc.invalidateQueries({ queryKey: ['admin-orders'] });
      toast.success('Order updated', `Status → ${status}`);
    } catch (err) {
      toast.error('Update failed', err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="card p-5">
      <h2 className="text-xl font-semibold text-ipe-green mb-3">Orders</h2>
      {loading && orders.length === 0 ? (
        <TableRowsSkeleton rows={3} cols={6} />
      ) : orders.length === 0 ? (
        <p className="text-ipe-ink/60 text-sm">No orders yet.</p>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <ul className="sm:hidden space-y-3">
            {orders.map((o) => {
              const p = productById.get(o.productId);
              const addr = o.shippingAddress as { line1?: string; city?: string; country?: string } | null;
              return (
                <li key={o.id} className="border border-ipe-green/10 rounded-md p-3">
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-medium">{p?.name ?? '?'} ×{o.quantity}</p>
                      <p className="text-xs text-ipe-ink/60 font-mono">{o.id.slice(0, 8)} · {o.buyerAddress ? `${o.buyerAddress.slice(0, 8)}…` : (o.customerEmail ?? '—')}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 h-fit rounded ${badgeForStatus(o.status)}`}>{o.status}</span>
                  </div>
                  <p className="text-sm mt-2">
                    {formatPaid(o)} <span className="text-xs text-ipe-ink/60 uppercase">· {o.paymentMethod}</span>
                  </p>
                  <p className="text-xs text-ipe-ink/60 mt-1">
                    {o.deliveryMethod === 'shipping' && addr
                      ? `→ ${addr.line1}, ${addr.city} (${addr.country})`
                      : o.deliveryMethod === 'pickup' && o.pickup
                        ? `pickup @ ${o.pickup.eventId} (${o.pickup.displayName})`
                        : '—'}
                  </p>
                  <div className="mt-2">
                    {o.status === 'paid' && (
                      <button className="btn-ghost text-xs" onClick={() => setStatus(o.id, 'shipped')}>
                        {o.deliveryMethod === 'pickup' ? 'Mark delivered' : 'Mark shipped'}
                      </button>
                    )}
                    {o.status === 'shipped' && (
                      <button className="btn-ghost text-xs" onClick={() => setStatus(o.id, 'delivered')}>
                        Mark delivered
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="hidden sm:block table-wrap">
            <table className="w-full text-sm">
              <thead className="text-left text-ipe-ink/60">
                <tr>
                  <th className="py-2">Order</th>
                  <th>Product</th>
                  <th>Buyer</th>
                  <th>Method</th>
                  <th>Total</th>
                  <th>Delivery</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const p = productById.get(o.productId);
                  const addr = o.shippingAddress as { line1?: string; city?: string; country?: string } | null;
                  return (
                    <tr key={o.id} className="border-t border-ipe-green/10 align-top">
                      <td className="py-2 font-mono text-xs">{o.id.slice(0, 8)}</td>
                      <td>{p?.name ?? '?'} ×{o.quantity}</td>
                      <td className="font-mono text-xs">{o.buyerAddress ? `${o.buyerAddress.slice(0, 10)}…` : (o.customerEmail ?? '—')}</td>
                      <td className="uppercase text-xs">{o.paymentMethod}</td>
                      <td>{formatPaid(o)}</td>
                      <td className="text-xs">
                        {o.deliveryMethod === 'shipping' && addr
                          ? `→ ${addr.line1}, ${addr.city} (${addr.country})`
                          : o.deliveryMethod === 'pickup' && o.pickup
                            ? `pickup @ ${o.pickup.eventId} (${o.pickup.displayName})`
                            : '—'}
                      </td>
                      <td>{o.status}</td>
                      <td>
                        {o.status === 'paid' && (
                          <button className="btn-ghost text-xs" onClick={() => setStatus(o.id, 'shipped')}>
                            {o.deliveryMethod === 'pickup' ? 'Mark delivered' : 'Mark shipped'}
                          </button>
                        )}
                        {o.status === 'shipped' && (
                          <button className="btn-ghost text-xs" onClick={() => setStatus(o.id, 'delivered')}>
                            Mark delivered
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function badgeForStatus(s: string) {
  switch (s) {
    case 'paid': return 'bg-blue-100 text-blue-800';
    case 'awaiting_payment': return 'bg-purple-100 text-purple-800';
    case 'shipped': return 'bg-amber-100 text-amber-800';
    case 'delivered': return 'bg-green-100 text-green-800';
    case 'refunded':
    case 'cancelled': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-700';
  }
}

/// Image URL input that previews the resolved image and accepts Google Drive
/// share links (auto-rewritten to googleusercontent thumbnails).
function ImageUrlField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const resolved = value ? normalizeImageUrl(value, 256) : '';
  const isDrive = resolved !== value.trim() && !!value;
  return (
    <div className="flex gap-3">
      <div className="flex-1 space-y-1">
        <input
          className="input"
          placeholder="Optional — paste an image URL or Drive share link"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="text-[11px] text-ipe-ink-50">
          Leave blank to use a brand-tinted placeholder with the product name.
        </p>
        {isDrive && (
          <details className="text-[11px]">
            <summary className="text-ipe-navy-600 dark:text-ipe-lime cursor-pointer">
              Drive link detected — how to make it public
            </summary>
            <div className="mt-1.5 space-y-1 text-ipe-ink-70">
              <p>
                We auto-rewrite Drive share URLs to a thumbnail endpoint. To make it visible to
                buyers, the file must be shared publicly:
              </p>
              <ol className="list-decimal list-inside space-y-0.5 pl-1">
                <li>Open the file in Google Drive</li>
                <li>Click <strong>Share</strong> (top-right)</li>
                <li>Under <strong>General access</strong>, change to <strong>"Anyone with the link"</strong></li>
                <li>Permission: <strong>Viewer</strong> · click Done</li>
              </ol>
              <p className="text-ipe-ink-50 truncate" title={resolved}>
                Resolves to: <code className="font-mono">{resolved}</code>
              </p>
            </div>
          </details>
        )}
      </div>
      <div className="w-16 h-16 rounded border border-ipe-stone-200 dark:border-ipe-navy-500/30 bg-ipe-stone-50 dark:bg-ipe-navy-700/30 overflow-hidden flex items-center justify-center text-[10px] text-ipe-ink-50 shrink-0">
        {resolved ? (
          <img
            src={resolved}
            alt="preview"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          'preview'
        )}
      </div>
    </div>
  );
}

/// Admin allowlist management — add an email and that person can sign into
/// /admin via Privy. Soft-delete (active=false) hides the row from the gate
/// without losing history. Self-deactivation is blocked server-side.
function AdminsCard({ currentAdminId }: { currentAdminId: string | undefined }) {
  const qc = useQueryClient();
  const toast = useToast();
  const adminsQ = useQuery({ queryKey: ['admins'], queryFn: api.listAdmins });
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!newEmail) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.addAdmin({ email: newEmail.trim(), name: newName.trim() || undefined });
      setNewEmail('');
      setNewName('');
      await qc.invalidateQueries({ queryKey: ['admins'] });
      toast.success('Admin added', created.email);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed to add admin';
      setError(msg);
      toast.error('Could not add admin', msg);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(a: AdminUserDTO) {
    try {
      await api.updateAdmin(a.id, { active: !a.active });
      await qc.invalidateQueries({ queryKey: ['admins'] });
      toast.success(a.active ? 'Admin deactivated' : 'Admin reactivated', a.email);
    } catch (err) {
      toast.error('Update failed', err instanceof Error ? err.message : String(err));
    }
  }

  async function remove(a: AdminUserDTO) {
    if (!confirm(`Deactivate ${a.email}?`)) return;
    try {
      await api.removeAdmin(a.id);
      await qc.invalidateQueries({ queryKey: ['admins'] });
      toast.success('Admin removed', a.email);
    } catch (err) {
      toast.error('Could not remove admin', err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="card p-5">
      <h2 className="text-xl font-semibold text-ipe-green mb-3">Admins</h2>
      <p className="text-xs text-ipe-ink/60 mb-3">
        Anyone whose Privy-linked email is on this list can access /admin.
      </p>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          className="input flex-1"
          type="email"
          placeholder="email@domain.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
        />
        <input
          className="input sm:w-40"
          placeholder="Name (optional)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="btn-primary" disabled={busy || !newEmail} onClick={add}>
          {busy ? 'Adding…' : 'Add admin'}
        </button>
      </div>
      {error && <p className="text-sm text-red-700 mb-3">{error}</p>}

      {adminsQ.isLoading && !adminsQ.data && (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="py-2 flex items-center justify-between gap-3">
              <div className="flex-1 space-y-1.5">
                <SkeletonText className="w-1/2" />
                <SkeletonText className="w-1/3" />
              </div>
              <SkeletonBox className="h-7 w-20 shrink-0" />
            </div>
          ))}
        </div>
      )}

      <ul className="divide-y divide-ipe-green/10">
        {(adminsQ.data ?? []).map((a) => {
          const isSelf = a.id === currentAdminId;
          return (
            <li key={a.id} className="py-2 flex items-center justify-between gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <p className="truncate">
                  {a.email}
                  {a.name && <span className="text-ipe-ink/60"> · {a.name}</span>}
                  {isSelf && <span className="text-xs ml-2 px-1.5 py-0.5 rounded bg-ipe-green/10 text-ipe-green">you</span>}
                </p>
                <p className="text-xs text-ipe-ink/50">
                  added {new Date(a.createdAt).toLocaleDateString()} · {a.active ? 'active' : 'inactive'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button className="btn-ghost text-xs" onClick={() => toggle(a)} disabled={isSelf}>
                  {a.active ? 'Deactivate' : 'Reactivate'}
                </button>
                {!isSelf && a.active && (
                  <button className="btn-ghost text-xs" onClick={() => remove(a)}>Remove</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatPaid(o: OrderDTO): string {
  switch (o.paymentMethod) {
    case 'ipe': return formatToken(o.totalPaid, 'IPE');
    case 'usdc': return formatToken(o.totalPaid, 'USDC');
    case 'pix': return formatBrl(o.totalPaid);
    case 'crypto-gateway': return `$${(Number(o.totalPaid) / 1e6).toFixed(2)} (crypto)`;
  }
}

/// Generic table-row skeleton — fills both the mobile stack and desktop table
/// in admin cards with placeholder bars while data is loading.
function TableRowsSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="space-y-2 mt-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid gap-3 items-center" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((__, j) => (
            <SkeletonText key={j} className={j === 0 ? 'w-3/4' : 'w-2/3'} />
          ))}
        </div>
      ))}
    </div>
  );
}
