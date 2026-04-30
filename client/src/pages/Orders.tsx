import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { Link } from 'wouter';
import { api, type OrderDTO, type ProductDTO } from '../api';
import { formatToken, formatBrl } from '../lib/format';
import { ProductImage } from '../components/ProductImage';
import { SkeletonBox, SkeletonText } from '../components/Skeleton';

export function Orders() {
  const { address } = useAccount();
  const ordersQ = useQuery({
    queryKey: ['orders', address],
    queryFn: () => api.ordersByBuyer(address!),
    enabled: !!address,
  });
  // Pulled in to render product thumbnail + name on each row.
  const productsQ = useQuery({ queryKey: ['products'], queryFn: api.listProducts });

  if (!address) {
    return (
      <EmptyState
        title="Connect your wallet"
        body="Sign in to see purchases tied to this wallet. Gateway-only orders without a wallet appear in your inbox by email."
      />
    );
  }
  if (ordersQ.isLoading) return <OrdersSkeleton />;
  if (!ordersQ.data?.length) {
    return (
      <EmptyState
        title="No purchases yet"
        body="When you buy something, your orders show up here with status, tracking and your onchain receipt."
        cta={{ href: '/', label: 'Browse the Shop' }}
      />
    );
  }

  const productById = new Map((productsQ.data ?? []).map((p) => [p.id, p] as const));

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ipe-green">My orders</h1>
        <p className="text-sm text-ipe-ink/60 mt-1">{ordersQ.data.length} order{ordersQ.data.length === 1 ? '' : 's'} on this wallet.</p>
      </header>
      <ul className="space-y-3">
        {ordersQ.data.map((o) => (
          <OrderRow key={o.id} order={o} product={productById.get(o.productId) ?? null} />
        ))}
      </ul>
    </section>
  );
}

function OrderRow({ order: o, product }: { order: OrderDTO; product: ProductDTO | null }) {
  return (
    <li className="card p-4 sm:p-5 motion-in">
      <div className="flex gap-4 items-start">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-md overflow-hidden bg-ipe-stone-100 dark:bg-ipe-navy-700/50 shrink-0">
          {product ? (
            <ProductImage src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full" aria-hidden />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <p className="font-medium text-ipe-ink truncate">
                {product?.name ?? 'Product'} <span className="text-ipe-ink/50">×{o.quantity}</span>
              </p>
              <p className="text-2xs uppercase tracking-widest text-ipe-ink/50 font-mono mt-0.5">
                #{o.id.slice(0, 8)}
              </p>
            </div>
            <span className={`status-${o.status} shrink-0`}>{o.status.replace('_', ' ')}</span>
          </div>

          <div className="flex items-center gap-2 mt-2 text-sm text-ipe-ink/70">
            <strong className="text-ipe-ink">{formatPaid(o)}</strong>
            <span className="text-ipe-ink/30">·</span>
            <span className="uppercase text-2xs tracking-wider">{methodLabel(o.paymentMethod)}</span>
            <span className="text-ipe-ink/30">·</span>
            <span className="text-2xs">
              {o.deliveryMethod === 'pickup' ? `pickup${o.pickup ? ` @ ${o.pickup.eventId}` : ''}` : 'shipping'}
            </span>
          </div>

          <FulfillmentTimeline status={o.status} delivery={o.deliveryMethod} />

          <TxLink order={o} />
        </div>
      </div>
    </li>
  );
}

/// Visualises fulfillment as 3 dots: paid → shipped/handed-off → delivered.
/// Cancelled/refunded statuses skip the timeline.
function FulfillmentTimeline({ status, delivery }: { status: string; delivery: string }) {
  if (status === 'cancelled' || status === 'refunded') return null;

  const steps = [
    { key: 'paid', label: 'Paid' },
    { key: 'shipped', label: delivery === 'pickup' ? 'Ready' : 'Shipped' },
    { key: 'delivered', label: 'Delivered' },
  ];
  const reachedIdx = (() => {
    if (status === 'awaiting_payment' || status === 'pending') return -1;
    if (status === 'paid') return 0;
    if (status === 'shipped') return 1;
    if (status === 'delivered') return 2;
    return -1;
  })();

  return (
    <div className="flex items-center gap-2 mt-3" aria-label={`Status: ${status}`}>
      {steps.map((s, i) => {
        const reached = i <= reachedIdx;
        const current = i === reachedIdx;
        return (
          <div key={s.key} className="flex items-center gap-2 flex-1 min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                reached
                  ? current
                    ? 'bg-ipe-green-600 dark:bg-ipe-gold ring-4 ring-ipe-green-600/15 dark:ring-ipe-gold/20'
                    : 'bg-ipe-green-600 dark:bg-ipe-gold'
                  : 'bg-ipe-stone-200 dark:bg-ipe-navy-500/40'
              }`}
              aria-hidden
            />
            <span className={`text-2xs uppercase tracking-wider truncate ${reached ? 'text-ipe-ink-70' : 'text-ipe-ink-30'}`}>
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={`flex-1 h-px ${i < reachedIdx ? 'bg-ipe-green-600/40 dark:bg-ipe-gold/40' : 'bg-ipe-stone-200 dark:bg-ipe-navy-500/30'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/// Receipt link: basescan for direct onchain buys, opaque for gateway flows
/// (we show the provider name + ref tail so support has something to look up).
function TxLink({ order: o }: { order: OrderDTO }) {
  if (!o.paymentRef) return null;
  if (o.paymentMethod === 'ipe' || o.paymentMethod === 'usdc') {
    return (
      <a
        className="inline-block mt-3 text-2xs uppercase tracking-wider underline text-ipe-green-700 dark:text-ipe-gold hover:opacity-80"
        target="_blank"
        rel="noreferrer"
        href={`https://sepolia.basescan.org/tx/${o.paymentRef}`}
      >
        View transaction
      </a>
    );
  }
  return (
    <p className="mt-3 text-2xs uppercase tracking-wider text-ipe-ink-50 font-mono">
      {o.paymentMethod === 'pix' ? 'Mercado Pago' : 'NOWPayments'} ref · {o.paymentRef.slice(-8)}
    </p>
  );
}

function methodLabel(m: string): string {
  switch (m) {
    case 'crypto-gateway': return 'crypto';
    default: return m;
  }
}

function formatPaid(o: { totalPaid: string; paymentMethod: string }): string {
  switch (o.paymentMethod) {
    case 'ipe': return formatToken(o.totalPaid, 'IPE');
    case 'usdc': return formatToken(o.totalPaid, 'USDC');
    case 'pix': return formatBrl(o.totalPaid);
    case 'crypto-gateway': return `$${(Number(o.totalPaid) / 1e6).toFixed(2)}`;
    default: return o.totalPaid;
  }
}

function EmptyState({ title, body, cta }: { title: string; body: string; cta?: { href: string; label: string } }) {
  return (
    <section className="text-center py-16 max-w-md mx-auto space-y-3">
      <h1 className="text-2xl font-display font-semibold text-ipe-navy-700 dark:text-ipe-cream-100">{title}</h1>
      <p className="text-ipe-ink/60 text-sm leading-relaxed">{body}</p>
      {cta && (
        <Link href={cta.href} className="btn-primary inline-flex mt-2">
          {cta.label}
        </Link>
      )}
    </section>
  );
}

function OrdersSkeleton() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <SkeletonBox className="h-9 w-48" />
        <SkeletonText className="w-32" />
      </div>
      <ul className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="card p-4 sm:p-5">
            <div className="flex gap-4 items-start">
              <SkeletonBox className="w-16 h-16 sm:w-20 sm:h-20 shrink-0" />
              <div className="flex-1 space-y-2.5">
                <SkeletonText className="w-2/3" />
                <SkeletonText className="w-1/3" />
                <SkeletonText className="w-1/2 mt-2" />
                <SkeletonBox className="h-3 w-full mt-3" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
