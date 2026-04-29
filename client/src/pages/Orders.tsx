import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { api } from '../api';
import { formatToken, formatBrl } from '../lib/format';

export function Orders() {
  const { address } = useAccount();
  const { data, isLoading } = useQuery({
    queryKey: ['orders', address],
    queryFn: () => api.ordersByBuyer(address!),
    enabled: !!address,
  });

  if (!address) return <p className="text-ipe-ink/60">Connect your wallet to see your orders.</p>;
  if (isLoading) return <p className="text-ipe-ink/60">Loading…</p>;
  if (!data?.length) return <p className="text-ipe-ink/60">No purchases yet.</p>;

  return (
    <section>
      <h1 className="text-3xl font-bold text-ipe-green mb-6">My orders</h1>
      <div className="space-y-3">
        {data.map((o) => (
          <div key={o.id} className="card p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-mono text-ipe-ink/70">order {o.id.slice(0, 8)}</p>
              <p>{o.quantity}× — {formatPaid(o)}</p>
              <p className="text-xs text-ipe-ink/60">
                via {o.paymentMethod.toUpperCase()} · {o.deliveryMethod}
                {o.pickup ? ` (${o.pickup.eventId})` : ''}
              </p>
              {o.paymentRef && o.paymentMethod !== 'pix' && (
                <a
                  className="text-xs underline text-ipe-green/70"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://sepolia.basescan.org/tx/${o.paymentRef}`}
                >
                  view tx
                </a>
              )}
            </div>
            <span className={`text-sm px-2 py-1 rounded ${badgeColor(o.status)}`}>{o.status}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatPaid(o: { totalPaid: string; paymentMethod: string }): string {
  switch (o.paymentMethod) {
    case 'ipe': return formatToken(o.totalPaid, 'IPE');
    case 'usdc': return formatToken(o.totalPaid, 'USDC');
    case 'pix': return formatBrl(o.totalPaid);
    case 'crypto-gateway': return `$${(Number(o.totalPaid) / 1e6).toFixed(2)} (crypto)`;
    default: return o.totalPaid;
  }
}

function badgeColor(status: string) {
  switch (status) {
    case 'paid': return 'bg-blue-100 text-blue-800';
    case 'awaiting_payment': return 'bg-purple-100 text-purple-800';
    case 'shipped': return 'bg-amber-100 text-amber-800';
    case 'delivered': return 'bg-green-100 text-green-800';
    case 'refunded':
    case 'cancelled': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-700';
  }
}
