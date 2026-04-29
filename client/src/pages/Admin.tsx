import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { parseEther, decodeEventLog } from 'viem';
import { IpeMarketAbi } from '@ipe/shared';
import { api, type ProductDTO } from '../api';
import { env } from '../config';
import { formatIpe } from '../lib/format';

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

function TreasuryCard({ data }: { data: { treasuryAddress: string; treasuryBalanceIpe: string; marketContractBalanceIpe: string } | undefined }) {
  if (!data) return null;
  return (
    <div className="card p-5">
      <h2 className="text-xl font-semibold text-ipe-green mb-3">Treasury</h2>
      <dl className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-ipe-ink/60">Treasury address</dt>
          <dd className="font-mono break-all">{data.treasuryAddress}</dd>
        </div>
        <div>
          <dt className="text-ipe-ink/60">Treasury balance</dt>
          <dd className="font-medium">{formatIpe(data.treasuryBalanceIpe)}</dd>
        </div>
        <div>
          <dt className="text-ipe-ink/60">In contract (orphan)</dt>
          <dd className="font-medium">{formatIpe(data.marketContractBalanceIpe)}</dd>
        </div>
      </dl>
    </div>
  );
}

function ProductsCard({ products }: { products: ProductDTO[] }) {
  const qc = useQueryClient();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [busyId, setBusyId] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    name: '',
    description: '',
    category: 't-shirt' as const,
    imageUrl: '',
    priceIpe: '50',
    maxSupply: '0',
    royaltyBps: 500,
    physicalStock: 0,
  });

  async function createOffchain() {
    await api.createProduct({
      ...draft,
      priceIpe: parseEther(draft.priceIpe).toString(),
      maxSupply: draft.maxSupply,
      active: true,
    });
    await qc.invalidateQueries({ queryKey: ['products'] });
    setDraft({ ...draft, name: '', description: '' });
  }

  async function pushOnchain(p: ProductDTO) {
    if (!publicClient) return;
    setBusyId(p.id);
    try {
      const hash = await writeContractAsync({
        address: env.ipeMarket,
        abi: IpeMarketAbi,
        functionName: 'listProduct',
        args: [BigInt(p.priceIpe), BigInt(p.maxSupply), BigInt(p.royaltyBps), p.imageUrl],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      // pull tokenId from the ProductListed event
      let tokenId: bigint | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: IpeMarketAbi, data: log.data, topics: log.topics });
          if (decoded.eventName === 'ProductListed') {
            tokenId = (decoded.args as { productId: bigint }).productId;
            break;
          }
        } catch { /* not our event */ }
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
          <select className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as never })}>
            <option value="t-shirt">t-shirt</option>
            <option value="hoodie">hoodie</option>
            <option value="cup">cup</option>
            <option value="cap">cap</option>
            <option value="other">other</option>
          </select>
          <input className="input" placeholder="Price (IPE)" value={draft.priceIpe} onChange={(e) => setDraft({ ...draft, priceIpe: e.target.value })} />
          <input className="input" placeholder="Max supply (0 = ∞)" value={draft.maxSupply} onChange={(e) => setDraft({ ...draft, maxSupply: e.target.value })} />
          <input className="input" type="number" placeholder="Royalty bps" value={draft.royaltyBps} onChange={(e) => setDraft({ ...draft, royaltyBps: Number(e.target.value) })} />
          <input className="input" type="number" placeholder="Physical stock" value={draft.physicalStock} onChange={(e) => setDraft({ ...draft, physicalStock: Number(e.target.value) })} />
          <button className="btn-primary col-span-2" onClick={createOffchain}>Save (off-chain)</button>
        </div>
      </details>

      <table className="w-full text-sm">
        <thead className="text-left text-ipe-ink/60">
          <tr>
            <th className="py-2">Product</th>
            <th>Onchain</th>
            <th>Price</th>
            <th>Stock (db)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-t border-ipe-green/10">
              <td className="py-2">{p.name}</td>
              <td>{p.tokenId ? <span className="text-green-700">tokenId #{p.tokenId}</span> : <span className="text-amber-700">not pushed</span>}</td>
              <td>{formatIpe(p.priceIpe)}</td>
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

function OrdersCard({ orders, products }: { orders: Awaited<ReturnType<typeof api.adminOrders>>; products: ProductDTO[] }) {
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
              <th>Total</th>
              <th>Status</th>
              <th>Address</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const p = productById.get(o.productId);
              const addr = o.shippingAddress as { line1?: string; city?: string; country?: string } | undefined;
              return (
                <tr key={o.id} className="border-t border-ipe-green/10 align-top">
                  <td className="py-2 font-mono text-xs">{o.id.slice(0, 8)}</td>
                  <td>{p?.name ?? '?'} ×{o.quantity}</td>
                  <td className="font-mono text-xs">{o.buyerAddress.slice(0, 10)}…</td>
                  <td>{formatIpe(o.totalPaidIpe)}</td>
                  <td>{o.status}</td>
                  <td className="text-xs">
                    {addr ? `${addr.line1}, ${addr.city} (${addr.country})` : '—'}
                  </td>
                  <td>
                    {o.status === 'paid' && (
                      <button className="btn-ghost text-xs" onClick={() => setStatus(o.id, 'shipped')}>
                        Mark shipped
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
