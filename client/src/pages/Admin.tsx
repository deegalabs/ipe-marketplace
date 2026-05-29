import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePublicClient, useWriteContract } from 'wagmi';
import { formatUnits, parseUnits, decodeEventLog, type Hex } from 'viem';
import { IpeMarketAbi } from '@ipe/shared';
import { usePrivy } from '@privy-io/react-auth';
import { api, type ProductDTO, type OrderDTO, type AdminUserDTO, type EventDTO } from '../api';
import { env } from '../config';
import { formatToken, formatBrl } from '../lib/format';
import { normalizeImageUrl } from '../lib/imageUrl';
import { useToast } from '../lib/toast';
import { useConfirm } from '../lib/confirm';
import { SkeletonBox, SkeletonText } from '../components/Skeleton';
import { InstallPosterModal } from '../components/InstallPosterModal';
import { Modal } from '../components/Modal';
import {
  PlusIcon, PencilIcon, SignOutIcon, PrinterIcon, UploadIcon, RefreshIcon,
  TruckIcon, PackageCheckIcon, UserCheckIcon, UserOffIcon, TrashIcon, SpinnerIcon,
} from '../components/AdminIcons';

type Tab = 'products' | 'orders' | 'events' | 'treasury' | 'admins';

const TABS: { id: Tab; label: string }[] = [
  { id: 'products', label: 'Products' },
  { id: 'orders', label: 'Orders' },
  { id: 'events', label: 'Events' },
  { id: 'treasury', label: 'Treasury' },
  { id: 'admins', label: 'Admins' },
];

/// Treasury is only meaningful when contracts are deployed. In gateway-only
/// deploys we hide the tab entirely to reduce clutter.
const TREASURY_AVAILABLE =
  !!env.ipeMarket && env.ipeMarket !== '0x0000000000000000000000000000000000000000';

function visibleTabs(): typeof TABS {
  return TABS.filter((t) => t.id !== 'treasury' || TREASURY_AVAILABLE);
}

/// Persist the active tab in the URL (?tab=orders) so refresh/back navigation
/// doesn't lose context and admins can deep-link a tab.
function useTabFromUrl(): [Tab, (t: Tab) => void] {
  const initial = (() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab') as Tab | null;
    return t && visibleTabs().some((v) => v.id === t) ? t : 'products';
  })();
  const [tab, setTab] = useState<Tab>(initial);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', tab);
    const url = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history.replaceState(null, '', url);
  }, [tab]);
  return [tab, setTab];
}

export function Admin() {
  const { user, logout } = usePrivy();
  const [posterOpen, setPosterOpen] = useState(false);
  const [tab, setTab] = useTabFromUrl();
  const meQ = useQuery({ queryKey: ['admin-me'], queryFn: api.adminMe });
  // Poll every 30s so new orders (from webhooks) and updated stock appear without
  // a manual reload. Admin tab is usually open in the background during sales.
  const productsQ = useQuery({
    queryKey: ['products'],
    queryFn: api.listProducts,
    refetchInterval: 30_000,
  });
  const ordersQ = useQuery({
    queryKey: ['admin-orders'],
    queryFn: api.adminOrders,
    refetchInterval: 30_000,
  });

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-ipe-green">Admin</h1>
          <p className="text-sm text-ipe-ink/60">
            Signed in as {meQ.data?.email ?? user?.email?.address ?? '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPosterOpen(true)} className="action-btn-ghost">
            <PrinterIcon /> Install poster
          </button>
          <button onClick={logout} className="action-btn-ghost">
            <SignOutIcon /> Sign out
          </button>
        </div>
      </header>

      <TabBar tab={tab} onChange={setTab} />

      {tab === 'products' && <ProductsCard products={productsQ.data ?? []} loading={productsQ.isLoading} />}
      {tab === 'orders' && <OrdersCard orders={ordersQ.data ?? []} products={productsQ.data ?? []} loading={ordersQ.isLoading} />}
      {tab === 'events' && <EventsCard />}
      {tab === 'treasury' && TREASURY_AVAILABLE && <TreasuryCard />}
      {tab === 'admins' && <AdminsCard currentAdminId={meQ.data?.adminId} />}

      {posterOpen && <InstallPosterModal onClose={() => setPosterOpen(false)} />}
    </section>
  );
}

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="border-b border-ipe-stone-200 dark:border-ipe-navy-500/30 overflow-x-auto">
      <nav className="flex gap-1 min-w-max" role="tablist">
        {visibleTabs().map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? 'border-ipe-gold text-ipe-green-700 dark:text-ipe-cream-100'
                  : 'border-transparent text-ipe-ink/60 hover:text-ipe-ink hover:border-ipe-stone-300'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ─── Treasury ──────────────────────────────────────────────────────────────

function TreasuryCard() {
  const treasuryQ = useQuery({
    queryKey: ['treasury'],
    queryFn: api.treasury,
    refetchInterval: 30_000,
    retry: false,
  });

  if (treasuryQ.isLoading && !treasuryQ.data) {
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
  if (!treasuryQ.data) return <p className="text-sm text-ipe-ink/60">Treasury data unavailable.</p>;

  const data = treasuryQ.data;
  const fmt = (b: { symbol: string; decimals: number; balance: string }) =>
    `${(Number(b.balance) / 10 ** b.decimals).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${b.symbol}`;
  return (
    <div className="card p-5">
      <h2 className="text-xl font-semibold text-ipe-green mb-3">Treasury</h2>
      <p className="text-xs text-ipe-ink/60 font-mono break-all mb-3">{data.treasuryAddress}</p>
      <div className="table-wrap">
        <table className="w-full text-sm">
          <thead className="text-left text-ipe-ink/60">
            <tr><th>Token</th><th>Treasury</th><th title="Tokens sitting in the marketplace contract — usually 0 unless a buyer paid without us forwarding to treasury yet.">In contract</th></tr>
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

// ─── Products ─────────────────────────────────────────────────────────────

interface ProductDraft {
  name: string;
  description: string;
  category: 't-shirt' | 'hoodie' | 'cup' | 'cap' | 'other';
  imageUrl: string;
  priceUsd: string;
  maxSupply: string;
  /// Stored as basis points (500 = 5%). Form input uses % for usability.
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
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  async function setActive(p: ProductDTO, active: boolean) {
    if (!active) {
      const ok = await confirm({
        title: 'Deactivate product?',
        body: <>Hide <strong>{p.name}</strong> from the public shop. Existing orders are preserved and the product can be reactivated anytime.</>,
        confirmLabel: 'Deactivate',
        destructive: true,
      });
      if (!ok) return;
    }
    setBusyId(p.id);
    try {
      await api.updateProduct(p.id, { active });
      await qc.invalidateQueries({ queryKey: ['products'] });
      toast.success(active ? 'Product activated' : 'Product deactivated', p.name);
    } catch (err) {
      toast.error('Update failed', err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteProduct(p: ProductDTO) {
    const ok = await confirm({
      title: 'Delete this product?',
      body: <>Permanently delete <strong>{p.name}</strong>. Only works if there are no orders for it; otherwise use Deactivate.</>,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(p.id);
    try {
      await api.deleteProduct(p.id);
      await qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product deleted', p.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // The server blocks delete when orders reference this product (FK). Offer
      // Deactivate as the natural next step instead of just toasting an error.
      if (msg.includes('existing orders')) {
        setBusyId(null);
        const deactivate = await confirm({
          title: "Can't delete — this product has orders",
          body: (
            <>
              <strong>{p.name}</strong> has past orders, so deleting it would break the
              order history. Use <strong>Deactivate</strong> instead — it hides the
              product from the shop while keeping the history intact (you can reactivate anytime).
            </>
          ),
          confirmLabel: 'Deactivate instead',
          destructive: true,
        });
        if (deactivate) await setActive(p, false);
        return;
      }
      toast.error('Delete failed', msg);
    } finally {
      setBusyId(null);
    }
  }

  async function pushOnchain(p: ProductDTO) {
    if (!publicClient) return;
    const ok = await confirm({
      title: 'Push product onchain?',
      body: <>Mint <strong>{p.name}</strong> on Base. This sends a transaction from your connected wallet and costs gas. Once onchain, the tokenId is permanent.</>,
      confirmLabel: 'Push onchain',
    });
    if (!ok) return;
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

  async function syncPriceOnchain(p: ProductDTO, token: 'ipe' | 'usdc') {
    if (!publicClient || !p.tokenId) return;
    const ok = await confirm({
      title: `Sync ${token.toUpperCase()} price onchain?`,
      body: <>Update the onchain price for <strong>{p.name}</strong> to match the database. This sends a transaction and costs gas.</>,
      confirmLabel: 'Sync price',
    });
    if (!ok) return;
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

  const editingProduct = editing && editing !== 'new' ? products.find((p) => p.id === editing) : null;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold text-ipe-green">Products</h2>
        <button className="action-btn-primary" onClick={() => setEditing('new')}>
          <PlusIcon /> New product
        </button>
      </div>

      {loading && products.length === 0 && <TableRowsSkeleton rows={3} cols={5} />}
      {!loading && products.length === 0 && (
        <p className="text-sm text-ipe-ink/60 py-4">No products yet. Click <strong>New product</strong> to add one.</p>
      )}

      {/* Mobile cards */}
      <ul className="sm:hidden space-y-3 mt-4">
        {products.map((p) => (
          <li key={p.id} className="border border-ipe-green/10 rounded-md p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-ipe-ink/60 mt-0.5">
                  {!p.active && <span className="text-red-600 mr-1">inactive</span>}
                  {p.physicalStock === 0 ? <span className="text-amber-700">sold out</span> : `stock ${p.physicalStock}`}
                  {p.tokenId && <span className="text-green-700 ml-1">· onchain #{p.tokenId}</span>}
                </p>
              </div>
              <p className="text-sm font-mono tabular-nums shrink-0">
                {BigInt(p.priceUsdc) > 0n ? `$${(Number(p.priceUsdc) / 1e6).toFixed(2)}` : '—'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button className="action-btn-ghost" onClick={() => setEditing(p.id)} disabled={busyId === p.id}>
                <PencilIcon /> Edit
              </button>
              <button
                className={p.active ? 'action-btn-ghost' : 'action-btn-primary'}
                disabled={busyId === p.id}
                onClick={() => setActive(p, !p.active)}
              >
                {p.active ? <><UserOffIcon /> Deactivate</> : <><UserCheckIcon /> Reactivate</>}
              </button>
              <button className="action-btn-destructive" disabled={busyId === p.id} onClick={() => deleteProduct(p)}>
                <TrashIcon /> Delete
              </button>
            </div>
            <details className="mt-2">
              <summary className="text-xs text-ipe-ink/50 cursor-pointer">Onchain actions</summary>
              <div className="flex flex-wrap gap-2 mt-2">
                {!p.tokenId && (
                  <button className="action-btn-ghost" disabled={busyId === p.id} onClick={() => pushOnchain(p)}>
                    {busyId === p.id ? <><SpinnerIcon /> Pushing…</> : <><UploadIcon /> Push onchain</>}
                  </button>
                )}
                {p.tokenId && BigInt(p.priceUsdc) > 0n && (
                  <button className="action-btn-ghost" disabled={busyId === p.id} onClick={() => syncPriceOnchain(p, 'usdc')}>
                    <RefreshIcon /> Sync USDC price
                  </button>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>

      {/* Desktop table */}
      <div className="hidden sm:block table-wrap mt-4">
        <table className="w-full text-sm">
          <thead className="text-left text-ipe-ink/60">
            <tr>
              <th className="py-2">Product</th>
              <th>Price (USD)</th>
              <th>Stock</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-ipe-green/10">
                <td className="py-2">
                  <div className="font-medium">{p.name}</div>
                  {p.tokenId && <div className="text-2xs text-green-700">onchain #{p.tokenId}</div>}
                </td>
                <td>{BigInt(p.priceUsdc) > 0n ? `$${(Number(p.priceUsdc) / 1e6).toFixed(2)}` : '—'}</td>
                <td>{p.physicalStock === 0 ? <span className="text-amber-700 font-medium">sold out</span> : p.physicalStock}</td>
                <td>{p.active ? <span className="text-green-700">active</span> : <span className="text-red-600">inactive</span>}</td>
                <td className="whitespace-nowrap">
                  <div className="inline-flex flex-wrap items-center gap-1.5">
                    <button className="action-btn-ghost" onClick={() => setEditing(p.id)} disabled={busyId === p.id}>
                      <PencilIcon /> Edit
                    </button>
                    <button
                      className={p.active ? 'action-btn-ghost' : 'action-btn-primary'}
                      disabled={busyId === p.id}
                      onClick={() => setActive(p, !p.active)}
                    >
                      {p.active ? <><UserOffIcon /> Deactivate</> : <><UserCheckIcon /> Reactivate</>}
                    </button>
                    <button className="action-btn-destructive" disabled={busyId === p.id} onClick={() => deleteProduct(p)}>
                      <TrashIcon /> Delete
                    </button>
                    <OnchainMenu p={p} busy={busyId === p.id} onPush={() => pushOnchain(p)} onSync={() => syncPriceOnchain(p, 'usdc')} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <Modal
          title={editing === 'new' ? 'New product' : `Edit · ${editingProduct?.name ?? 'product'}`}
          onClose={() => setEditing(null)}
        >
          {/* `key` forces fresh state when switching between products. */}
          <ProductForm
            key={editing}
            mode={editing === 'new' ? 'new' : 'edit'}
            initial={editing === 'new' ? EMPTY_DRAFT : draftFromProduct(editingProduct!)}
            targetId={editing === 'new' ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={async () => {
              await qc.invalidateQueries({ queryKey: ['products'] });
              setEditing(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function OnchainMenu({ p, busy, onPush, onSync }: { p: ProductDTO; busy: boolean; onPush: () => void; onSync: () => void }) {
  const [open, setOpen] = useState(false);
  // Only show when there's something meaningful to do.
  const canPush = !p.tokenId;
  const canSync = !!p.tokenId && BigInt(p.priceUsdc) > 0n;
  if (!canPush && !canSync) return null;
  return (
    <div className="relative">
      <button
        type="button"
        className="action-btn-ghost"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Onchain ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 min-w-[180px] bg-white dark:bg-ipe-navy-800 border border-ipe-stone-200 dark:border-ipe-navy-500/30 rounded-md shadow-lg py-1 text-sm">
            {canPush && (
              <button
                className="w-full text-left px-3 py-2 hover:bg-ipe-stone-50 dark:hover:bg-ipe-navy-700 flex items-center gap-2"
                onClick={() => { setOpen(false); onPush(); }}
              >
                <UploadIcon /> Push onchain
              </button>
            )}
            {canSync && (
              <button
                className="w-full text-left px-3 py-2 hover:bg-ipe-stone-50 dark:hover:bg-ipe-navy-700 flex items-center gap-2"
                onClick={() => { setOpen(false); onSync(); }}
              >
                <RefreshIcon /> Sync USDC price
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface ProductFormProps {
  mode: 'new' | 'edit';
  initial: ProductDraft;
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

  /// Royalty is stored as bps onchain (500 = 5%). Show it as % in the form
  /// so admins don't need to know what "bps" means.
  const royaltyPct = draft.royaltyBps / 100;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Name" required full>
          <input
            className="input"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. Ipê Tee — Green"
          />
        </Field>

        <Field label="Image URL" full>
          <ImageUrlField value={draft.imageUrl} onChange={(v) => setDraft({ ...draft, imageUrl: v })} />
        </Field>

        <Field label="Description" full>
          <textarea
            className="input min-h-[80px]"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Short description shown on the product page."
          />
        </Field>

        <Field label="Category">
          <select
            className="input"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value as ProductDraft['category'] })}
          >
            <option value="t-shirt">T-shirt</option>
            <option value="hoodie">Hoodie</option>
            <option value="cup">Cup</option>
            <option value="cap">Cap</option>
            <option value="other">Other</option>
          </select>
        </Field>

        <Field label="Price (USD)" required hint="One canonical USD price. PIX converts to BRL live at checkout.">
          <input
            className="input"
            type="number"
            step="0.01"
            min="0"
            placeholder="29.90"
            value={draft.priceUsd}
            onChange={(e) => setDraft({ ...draft, priceUsd: e.target.value })}
          />
        </Field>

        <Field label="Physical stock" hint="0 = sold out (shown as a badge in the shop).">
          <input
            className="input"
            type="number"
            min="0"
            value={draft.physicalStock}
            onChange={(e) => setDraft({ ...draft, physicalStock: Number(e.target.value) })}
          />
        </Field>

        <Field label="Max supply" hint="0 = unlimited. Onchain mint cap.">
          <input
            className="input"
            type="number"
            min="0"
            value={draft.maxSupply}
            onChange={(e) => setDraft({ ...draft, maxSupply: e.target.value })}
          />
        </Field>

        <Field label="Royalty (%)" hint="Secondary-market royalty paid to treasury. 5% is standard.">
          <input
            className="input"
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={royaltyPct}
            onChange={(e) => setDraft({ ...draft, royaltyBps: Math.round(Number(e.target.value) * 100) })}
          />
        </Field>

        <Field label="Delivery options" full>
          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.pickupAvailable}
                onChange={(e) => setDraft({ ...draft, pickupAvailable: e.target.checked })}
              />
              Allow event pickup
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.shippingAvailable}
                onChange={(e) => setDraft({ ...draft, shippingAvailable: e.target.checked })}
              />
              Allow shipping
            </label>
          </div>
        </Field>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-ipe-stone-200 dark:border-ipe-navy-500/30">
        <button type="button" className="action-btn-ghost" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="action-btn-primary" onClick={save} disabled={saving}>
          {saving ? <><SpinnerIcon /> Saving…</> : (mode === 'new' ? 'Create product' : 'Save changes')}
        </button>
      </div>
    </div>
  );
}

/// Form field wrapper — adds an explicit label + optional hint. `full` makes
/// it span both columns in the 2-col grid. `required` adds a red asterisk.
function Field({ label, hint, required, full, children }: { label: string; hint?: string; required?: boolean; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="label">
        {label}
        {required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-ipe-ink-50 mt-1">{hint}</p>}
    </div>
  );
}

// ─── Orders ────────────────────────────────────────────────────────────────

function OrdersCard({ orders, products, loading }: { orders: OrderDTO[]; products: ProductDTO[]; loading: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const productById = new Map(products.map((p) => [p.id, p] as const));

  async function setStatus(o: OrderDTO, status: string) {
    // Confirm transitions that have visible side effects (email to the buyer).
    const emailNote = status === 'shipped'
      ? (o.deliveryMethod === 'pickup' ? 'A "ready for pickup" email will be sent to the buyer.' : 'A "shipped" email with tracking will be sent to the buyer.')
      : status === 'delivered'
        ? 'A "delivered" email will be sent to the buyer.'
        : null;
    if (emailNote) {
      const ok = await confirm({
        title: `Mark as ${status}?`,
        body: <>{emailNote} Continue?</>,
        confirmLabel: `Mark as ${status}`,
      });
      if (!ok) return;
    }
    try {
      await api.updateOrder(o.id, { status });
      await qc.invalidateQueries({ queryKey: ['admin-orders'] });
      toast.success('Order updated', `Status → ${status}`);
    } catch (err) {
      toast.error('Update failed', err instanceof Error ? err.message : String(err));
    }
  }

  async function refund(o: OrderDTO) {
    const isPix = o.paymentProvider === 'mercadopago';
    const ok = await confirm({
      title: 'Refund this order?',
      body: isPix
        ? 'This will call Mercado Pago to refund the PIX payment and mark the order as refunded.'
        : 'Crypto refunds are irreversible and must be sent manually from treasury. This will only flip the order status to refunded.',
      confirmLabel: 'Refund',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.refundOrder(o.id);
      await qc.invalidateQueries({ queryKey: ['admin-orders'] });
      toast.success('Order refunded', isPix ? 'Mercado Pago refund requested' : 'Status set to refunded — send manual refund');
    } catch (err) {
      toast.error('Refund failed', err instanceof Error ? err.message : String(err));
    }
  }

  const canRefund = (o: OrderDTO) =>
    (o.status === 'paid' || o.status === 'shipped' || o.status === 'delivered') &&
    (o.paymentProvider === 'mercadopago' || o.paymentProvider === 'nowpayments');

  return (
    <div className="card p-5">
      <h2 className="text-xl font-semibold text-ipe-green mb-3">Orders</h2>
      {loading && orders.length === 0 ? (
        <TableRowsSkeleton rows={3} cols={6} />
      ) : orders.length === 0 ? (
        <p className="text-ipe-ink/60 text-sm">No orders yet.</p>
      ) : (
        <>
          {/* Mobile cards */}
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
                        ? `pickup @ ${o.pickup.displayName || o.pickup.eventId}`
                        : '—'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {o.status === 'paid' && (
                      <button className="action-btn-ghost" onClick={() => setStatus(o, 'shipped')}>
                        <TruckIcon /> {o.deliveryMethod === 'pickup' ? 'Mark delivered' : 'Mark shipped'}
                      </button>
                    )}
                    {o.status === 'shipped' && (
                      <button className="action-btn-ghost" onClick={() => setStatus(o, 'delivered')}>
                        <PackageCheckIcon /> Mark delivered
                      </button>
                    )}
                    {canRefund(o) && (
                      <button className="action-btn-destructive" onClick={() => refund(o)}>
                        <RefreshIcon /> Refund
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop table */}
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
                            ? `pickup @ ${o.pickup.displayName || o.pickup.eventId}`
                            : '—'}
                      </td>
                      <td><span className={`text-xs px-2 py-0.5 rounded ${badgeForStatus(o.status)}`}>{o.status}</span></td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {o.status === 'paid' && (
                            <button className="btn-ghost text-xs" onClick={() => setStatus(o, 'shipped')}>
                              {o.deliveryMethod === 'pickup' ? 'Mark delivered' : 'Mark shipped'}
                            </button>
                          )}
                          {o.status === 'shipped' && (
                            <button className="btn-ghost text-xs" onClick={() => setStatus(o, 'delivered')}>
                              Mark delivered
                            </button>
                          )}
                          {canRefund(o) && (
                            <button className="btn-ghost text-xs text-red-600" onClick={() => refund(o)}>
                              Refund
                            </button>
                          )}
                        </div>
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

// ─── Events ────────────────────────────────────────────────────────────────

interface EventDraft {
  slug: string;
  name: string;
  date: string;       // datetime-local value (YYYY-MM-DDTHH:mm)
  location: string;
  active: boolean;
}

const EMPTY_EVENT: EventDraft = { slug: '', name: '', date: '', location: '', active: true };

function EventsCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const eventsQ = useQuery({ queryKey: ['events-admin'], queryFn: api.adminListEvents });
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const events = eventsQ.data ?? [];

  async function remove(e: EventDTO) {
    const ok = await confirm({
      title: 'Delete event?',
      body: <>Permanently remove <strong>{e.name}</strong>. Existing orders that referenced this event keep their slug, but the dropdown won't show it anymore.</>,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteEvent(e.id);
      await qc.invalidateQueries({ queryKey: ['events-admin'] });
      await qc.invalidateQueries({ queryKey: ['events'] });
      toast.success('Event deleted', e.name);
    } catch (err) {
      toast.error('Delete failed', err instanceof Error ? err.message : String(err));
    }
  }

  async function toggle(e: EventDTO) {
    try {
      await api.updateEvent(e.id, { active: !e.active });
      await qc.invalidateQueries({ queryKey: ['events-admin'] });
      await qc.invalidateQueries({ queryKey: ['events'] });
      toast.success(e.active ? 'Event hidden' : 'Event reactivated', e.name);
    } catch (err) {
      toast.error('Update failed', err instanceof Error ? err.message : String(err));
    }
  }

  const editingEvent = editing && editing !== 'new' ? events.find((e) => e.id === editing) : null;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xl font-semibold text-ipe-green">Events</h2>
          <p className="text-xs text-ipe-ink/60 mt-1">
            Active events show as a dropdown in the buyer's pickup form. Add the next meetup so buyers don't have to guess the slug.
          </p>
        </div>
        <button className="action-btn-primary" onClick={() => setEditing('new')}>
          <PlusIcon /> New event
        </button>
      </div>

      {eventsQ.isLoading && events.length === 0 && <TableRowsSkeleton rows={2} cols={4} />}
      {!eventsQ.isLoading && events.length === 0 && (
        <p className="text-sm text-ipe-ink/60 py-4">No events yet. Add one so buyers can pick a pickup location.</p>
      )}

      <ul className="divide-y divide-ipe-green/10">
        {events.map((e) => (
          <li key={e.id} className="py-3 flex items-start justify-between gap-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{e.name}</p>
              <p className="text-xs text-ipe-ink/60 mt-0.5">
                <span className="font-mono">{e.slug}</span> · {new Date(e.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                {e.location && <> · 📍 {e.location}</>}
                {!e.active && <span className="text-red-600 ml-2">inactive</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button className="action-btn-ghost" onClick={() => setEditing(e.id)}>
                <PencilIcon /> Edit
              </button>
              <button
                className={e.active ? 'action-btn-ghost' : 'action-btn-primary'}
                onClick={() => toggle(e)}
              >
                {e.active ? <><UserOffIcon /> Hide</> : <><UserCheckIcon /> Show</>}
              </button>
              <button className="action-btn-destructive" onClick={() => remove(e)}>
                <TrashIcon /> Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing !== null && (
        <Modal
          title={editing === 'new' ? 'New event' : `Edit · ${editingEvent?.name ?? 'event'}`}
          onClose={() => setEditing(null)}
        >
          <EventForm
            key={editing}
            mode={editing === 'new' ? 'new' : 'edit'}
            initial={editing === 'new' ? EMPTY_EVENT : eventDraftFrom(editingEvent!)}
            targetId={editing === 'new' ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={async () => {
              await qc.invalidateQueries({ queryKey: ['events-admin'] });
              await qc.invalidateQueries({ queryKey: ['events'] });
              setEditing(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function eventDraftFrom(e: EventDTO): EventDraft {
  // Convert ISO → datetime-local format (YYYY-MM-DDTHH:mm) in local TZ.
  const d = new Date(e.date);
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { slug: e.slug, name: e.name, date: local, location: e.location, active: e.active };
}

function EventForm({
  mode, initial, targetId, onClose, onSaved,
}: {
  mode: 'new' | 'edit';
  initial: EventDraft;
  targetId: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<EventDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!draft.slug.match(/^[a-z0-9-]{2,}$/)) {
      setError('Slug must be lowercase letters, digits or hyphens (e.g. "ipe-demo-day-2026").');
      return;
    }
    if (!draft.name.trim() || !draft.date) {
      setError('Name and date are required.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const dateISO = new Date(draft.date).toISOString();
      if (mode === 'new') {
        await api.createEvent({
          slug: draft.slug.trim(),
          name: draft.name.trim(),
          date: dateISO,
          location: draft.location.trim() || undefined,
          active: draft.active,
        });
        toast.success('Event created', draft.name);
      } else {
        await api.updateEvent(targetId!, {
          name: draft.name.trim(),
          date: dateISO,
          location: draft.location.trim(),
          active: draft.active,
        });
        toast.success('Event updated', draft.name);
      }
      await onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'save failed';
      setError(msg);
      toast.error('Could not save event', msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Slug" required hint="URL-safe ID stored on orders. Cannot be changed after creation." full={mode === 'edit'}>
          <input
            className="input font-mono"
            value={draft.slug}
            onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
            placeholder="ipe-demo-day-2026"
            disabled={mode === 'edit'}
          />
        </Field>

        {mode === 'new' && <div />}

        <Field label="Name" required full>
          <input
            className="input"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Ipê Demo Day 2026"
          />
        </Field>

        <Field label="Date & time" required>
          <input
            className="input"
            type="datetime-local"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </Field>

        <Field label="Location" hint="Optional — shown to buyers under the dropdown.">
          <input
            className="input"
            value={draft.location}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
            placeholder="São Paulo, BR"
          />
        </Field>

        <Field label="Visibility" full>
          <label className="flex items-center gap-2 text-sm pt-1">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            />
            Active — show in pickup dropdown
          </label>
        </Field>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-ipe-stone-200 dark:border-ipe-navy-500/30">
        <button type="button" className="action-btn-ghost" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="action-btn-primary" onClick={save} disabled={saving}>
          {saving ? <><SpinnerIcon /> Saving…</> : (mode === 'new' ? 'Create event' : 'Save changes')}
        </button>
      </div>
    </div>
  );
}

// ─── Image URL field ──────────────────────────────────────────────────────

function ImageUrlField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState<'upload' | 'url'>(() => (value && /^https?:\/\//.test(value) ? 'url' : 'upload'));

  const resolved = value ? normalizeImageUrl(value, 256) : '';
  const isDrive = resolved !== value.trim() && !!value;

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Invalid file', 'Only image files are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large', 'Max 5 MB.');
      return;
    }
    setUploading(true);
    try {
      const { url } = await api.uploadProductImage(file);
      onChange(url);
      toast.success('Image uploaded', file.name);
    } catch (err) {
      toast.error('Upload failed', err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        <div className="flex-1 space-y-2">
          {/* Mode tabs */}
          <div className="inline-flex gap-1 text-xs rounded-md p-0.5 bg-ipe-stone-100 dark:bg-ipe-navy-700/40">
            <button
              type="button"
              onClick={() => setMode('upload')}
              className={`px-2.5 py-1 rounded transition-colors ${mode === 'upload' ? 'bg-white dark:bg-ipe-navy-800 shadow-sm font-medium' : 'text-ipe-ink/60'}`}
            >
              Upload
            </button>
            <button
              type="button"
              onClick={() => setMode('url')}
              className={`px-2.5 py-1 rounded transition-colors ${mode === 'url' ? 'bg-white dark:bg-ipe-navy-800 shadow-sm font-medium' : 'text-ipe-ink/60'}`}
            >
              Paste URL
            </button>
          </div>

          {mode === 'upload' ? (
            <ImageDropzone uploading={uploading} hasImage={!!resolved} onFile={handleFile} onClear={() => onChange('')} />
          ) : (
            <input
              className="input"
              placeholder="https://… or a Drive share link"
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
          )}

          <p className="text-[11px] text-ipe-ink-50">
            Leave blank to use a brand-tinted placeholder with the product name.
          </p>

          {mode === 'url' && isDrive && (
            <details className="text-[11px]">
              <summary className="text-ipe-navy-600 dark:text-ipe-lime cursor-pointer">
                Drive link detected — how to make it public
              </summary>
              <div className="mt-1.5 space-y-1 text-ipe-ink-70">
                <p>We auto-rewrite Drive share URLs to a thumbnail endpoint. To make it visible to buyers, the file must be shared publicly:</p>
                <ol className="list-decimal list-inside space-y-0.5 pl-1">
                  <li>Open the file in Google Drive</li>
                  <li>Click <strong>Share</strong> (top-right)</li>
                  <li>Under <strong>General access</strong>, change to <strong>"Anyone with the link"</strong></li>
                  <li>Permission: <strong>Viewer</strong> · click Done</li>
                </ol>
              </div>
            </details>
          )}
        </div>

        <div className="w-32 sm:w-40 aspect-square self-start rounded-md border border-ipe-stone-200 dark:border-ipe-navy-500/30 bg-ipe-stone-50 dark:bg-ipe-navy-700/30 overflow-hidden flex items-center justify-center text-xs text-ipe-ink-50 shrink-0">
          {resolved ? (
            <img
              src={resolved}
              alt="preview"
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            'preview'
          )}
        </div>
      </div>
    </div>
  );
}

function ImageDropzone({ uploading, hasImage, onFile, onClear }: {
  uploading: boolean;
  hasImage: boolean;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      className={`relative flex flex-col items-center justify-center text-center px-3 py-5 rounded-md border-2 border-dashed transition-colors ${
        dragging
          ? 'border-ipe-gold bg-ipe-gold/5'
          : 'border-ipe-stone-300 dark:border-ipe-navy-500/40 hover:border-ipe-navy-400 dark:hover:border-ipe-gold/40'
      }`}
    >
      {uploading ? (
        <p className="text-sm text-ipe-ink/70 flex items-center gap-2"><SpinnerIcon /> Uploading…</p>
      ) : (
        <>
          <p className="text-sm font-medium text-ipe-ink">
            {hasImage ? 'Replace image' : 'Drop image here'}
          </p>
          <p className="text-[11px] text-ipe-ink-50 mt-0.5">PNG, JPG, WebP or GIF · max 5 MB</p>
          <label className="mt-2 inline-flex items-center px-3 py-1.5 text-xs rounded-md bg-ipe-navy-700 text-ipe-cream-100 cursor-pointer hover:bg-ipe-navy-600 transition-colors">
            Choose file
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = '';
              }}
            />
          </label>
          {hasImage && (
            <button type="button" onClick={onClear} className="mt-2 text-[11px] text-ipe-ink-50 underline hover:text-ipe-ink">
              Remove image
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Admins ────────────────────────────────────────────────────────────────

function AdminsCard({ currentAdminId }: { currentAdminId: string | undefined }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
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
    if (a.active) {
      const ok = await confirm({
        title: 'Deactivate admin?',
        body: <><strong>{a.email}</strong> will lose access to the admin panel immediately. Reactivate anytime.</>,
        confirmLabel: 'Deactivate',
        destructive: true,
      });
      if (!ok) return;
    }
    try {
      await api.updateAdmin(a.id, { active: !a.active });
      await qc.invalidateQueries({ queryKey: ['admins'] });
      toast.success(a.active ? 'Admin deactivated' : 'Admin reactivated', a.email);
    } catch (err) {
      toast.error('Update failed', err instanceof Error ? err.message : String(err));
    }
  }

  async function remove(a: AdminUserDTO) {
    const ok = await confirm({
      title: 'Remove admin?',
      body: <>Deactivate access for <strong>{a.email}</strong>. They'll no longer be able to sign in to the admin panel until reactivated.</>,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
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
        <button className="action-btn-primary" disabled={busy || !newEmail} onClick={add}>
          {busy ? <><SpinnerIcon /> Adding…</> : <><PlusIcon /> Add admin</>}
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
                <button
                  className={a.active ? 'action-btn-destructive' : 'action-btn-primary'}
                  onClick={() => toggle(a)}
                  disabled={isSelf}
                >
                  {a.active ? <><UserOffIcon /> Deactivate</> : <><UserCheckIcon /> Reactivate</>}
                </button>
                {!isSelf && a.active && (
                  <button className="action-btn-destructive" onClick={() => remove(a)}>
                    <TrashIcon /> Remove
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Shared utils ─────────────────────────────────────────────────────────

function formatPaid(o: OrderDTO): string {
  switch (o.paymentMethod) {
    case 'ipe': return formatToken(o.totalPaid, 'IPE');
    case 'usdc': return formatToken(o.totalPaid, 'USDC');
    case 'pix': return formatBrl(o.totalPaid);
    case 'crypto-gateway': return `$${(Number(o.totalPaid) / 1e6).toFixed(2)} (crypto)`;
  }
}

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
