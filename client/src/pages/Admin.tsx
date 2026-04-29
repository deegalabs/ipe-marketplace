import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { parseUnits, decodeEventLog, type Hex } from 'viem';
import { IpeMarketAbi } from '@ipe/shared';
import { api, type ProductDTO, type OrderDTO } from '../api';
import { env } from '../config';
import { formatToken, formatBrl } from '../lib/format';
import { useCurrency } from '../lib/currency';

export function Admin() {
  const { address } = useAccount();
  const treasuryQ = useQuery({ queryKey: ['treasury'], queryFn: api.treasury, refetchInterval: 30_000 });
  const productsQ = useQuery({ queryKey: ['products'], queryFn: api.listProducts });
  const ordersQ = useQuery({ queryKey: ['admin-orders'], queryFn: api.adminOrders });

  if (!address) return <p className="text-ipe-ink/60">Connect a wallet to access admin.</p>;

  return (
    <section className="space-y-10">
      <header>
        <h1 className="text-3xl font-bold text-ipe-green">Admin</h1>
        <p className="text-sm text-ipe-ink/60">
          PoC: any connected wallet sees this view. Wire `requireAdmin` middleware before mainnet.
        </p>
      </header>

      <TreasuryCard data={treasuryQ.data} />
      <ProductsCard products={productsQ.data ?? []} />
      <OrdersCard orders={ordersQ.data ?? []} products={productsQ.data ?? []} />
    </section>
  );
}

function TreasuryCard({ data }: { data: Awaited<ReturnType<typeof api.treasury>> | undefined }) {
  if (!data) return null;
  const fmt = (b: { symbol: string; decimals: number; balance: string }) =>
    `${(Number(b.balance) / 10 ** b.decimals).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${b.symbol}`;
  return (
    <div className="card p-5">
      <h2 className="text-xl font-semibold text-ipe-green mb-3">Treasury</h2>
      <p className="text-xs text-ipe-ink/60 font-mono break-all mb-3">{data.treasuryAddress}</p>
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
  );
}

interface ProductDraft {
  name: string;
  description: string;
  category: 't-shirt' | 'hoodie' | 'cup' | 'cap' | 'other';
  imageUrl: string;
  /// Display strings — converted to smallest unit on submit.
  priceIpe: string;
  priceUsdc: string;
  priceBrl: string;     // human input "150" → 15000 cents
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
  priceIpe: '50',
  priceUsdc: '30',
  priceBrl: '150',
  maxSupply: '0',
  royaltyBps: 500,
  physicalStock: 0,
  pickupAvailable: true,
  shippingAvailable: true,
};

function ProductsCard({ products }: { products: ProductDTO[] }) {
  const qc = useQueryClient();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { rates } = useCurrency();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);

  function suggestPrices() {
    if (!rates?.ipeUsd || !rates.usdcBrl) {
      alert('Rates not ready — try again in a moment.');
      return;
    }
    // Use BRL as the reference and back-fill the other two.
    const brl = Number(draft.priceBrl);
    const usdcPerBrl = 1 / Number(rates.usdcBrl);
    const usdc = brl * usdcPerBrl;
    const ipe = usdc / Number(rates.ipeUsd);
    setDraft({
      ...draft,
      priceUsdc: usdc.toFixed(2),
      priceIpe: ipe.toFixed(2),
    });
  }

  async function createOffchain() {
    await api.createProduct({
      ...draft,
      priceIpe: parseUnits(draft.priceIpe, 18).toString(),
      priceUsdc: parseUnits(draft.priceUsdc, 6).toString(),
      priceBrl: BigInt(Math.round(Number(draft.priceBrl) * 100)).toString(),
      maxSupply: draft.maxSupply,
      active: true,
    });
    await qc.invalidateQueries({ queryKey: ['products'] });
    setDraft(EMPTY_DRAFT);
  }

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
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card p-5">
      <h2 className="text-xl font-semibold text-ipe-green mb-3">Products</h2>

      <details className="mb-4">
        <summary className="cursor-pointer text-sm text-ipe-green">+ New product</summary>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <input className="input" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className="input" placeholder="Image URL" value={draft.imageUrl} onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })} />
          <input className="input" placeholder="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <select className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as ProductDraft['category'] })}>
            <option value="t-shirt">t-shirt</option>
            <option value="hoodie">hoodie</option>
            <option value="cup">cup</option>
            <option value="cap">cap</option>
            <option value="other">other</option>
          </select>
          <div>
            <label className="label">Price IPE</label>
            <input className="input" value={draft.priceIpe} onChange={(e) => setDraft({ ...draft, priceIpe: e.target.value })} />
          </div>
          <div>
            <label className="label">Price USDC</label>
            <input className="input" value={draft.priceUsdc} onChange={(e) => setDraft({ ...draft, priceUsdc: e.target.value })} />
          </div>
          <div>
            <label className="label">Price BRL (R$)</label>
            <input className="input" value={draft.priceBrl} onChange={(e) => setDraft({ ...draft, priceBrl: e.target.value })} />
          </div>
          <button type="button" className="btn-ghost text-xs" onClick={suggestPrices}>
            Suggest from BRL using live rates
          </button>
          <input className="input" placeholder="Max supply (0 = ∞)" value={draft.maxSupply} onChange={(e) => setDraft({ ...draft, maxSupply: e.target.value })} />
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
          <button className="btn-primary col-span-2" onClick={createOffchain}>Save (off-chain)</button>
        </div>
      </details>

      <table className="w-full text-sm">
        <thead className="text-left text-ipe-ink/60">
          <tr>
            <th className="py-2">Product</th>
            <th>Onchain</th>
            <th>IPE</th>
            <th>USDC</th>
            <th>BRL</th>
            <th>Stock</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-t border-ipe-green/10">
              <td className="py-2">{p.name}</td>
              <td>{p.tokenId ? <span className="text-green-700">#{p.tokenId}</span> : <span className="text-amber-700">offline</span>}</td>
              <td>{BigInt(p.priceIpe) > 0n ? formatToken(p.priceIpe, 'IPE') : '—'}</td>
              <td>{BigInt(p.priceUsdc) > 0n ? formatToken(p.priceUsdc, 'USDC') : '—'}</td>
              <td>{BigInt(p.priceBrl) > 0n ? formatBrl(p.priceBrl) : '—'}</td>
              <td>{p.physicalStock}</td>
              <td>
                {!p.tokenId && (
                  <button className="btn-ghost text-xs" disabled={busyId === p.id} onClick={() => pushOnchain(p)}>
                    {busyId === p.id ? 'Pushing…' : 'Push onchain'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrdersCard({ orders, products }: { orders: OrderDTO[]; products: ProductDTO[] }) {
  const qc = useQueryClient();
  const productById = new Map(products.map((p) => [p.id, p] as const));

  async function setStatus(id: string, status: string) {
    await api.updateOrder(id, { status });
    await qc.invalidateQueries({ queryKey: ['admin-orders'] });
  }

  return (
    <div className="card p-5">
      <h2 className="text-xl font-semibold text-ipe-green mb-3">Orders</h2>
      {orders.length === 0 ? (
        <p className="text-ipe-ink/60 text-sm">No orders yet.</p>
      ) : (
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
                  <td className="font-mono text-xs">{o.buyerAddress.slice(0, 10)}…</td>
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
      )}
    </div>
  );
}

function formatPaid(o: OrderDTO): string {
  switch (o.paymentMethod) {
    case 'ipe': return formatToken(o.totalPaid, 'IPE');
    case 'usdc': return formatToken(o.totalPaid, 'USDC');
    case 'pix': return formatBrl(o.totalPaid);
  }
}
