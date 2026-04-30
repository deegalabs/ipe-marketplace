import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { Link } from 'wouter';
import { api, type OrderDTO, type ProductDTO } from '../api';
import { formatToken, formatBrl } from '../lib/format';
import { ProductImage } from '../components/ProductImage';
import { SkeletonBox, SkeletonText } from '../components/Skeleton';
import { useToast } from '../lib/toast';

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
  if (ordersQ.error) {
    return (
      <EmptyState
        title="Couldn't load orders"
        body={ordersQ.error instanceof Error ? ordersQ.error.message : 'Something went wrong fetching your orders. Try again in a moment.'}
      />
    );
  }
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

          {(o.status === 'awaiting_payment' || o.status === 'pending') && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {o.status === 'awaiting_payment' && <ResumePaymentButton order={o} />}
              <CancelOrderButton order={o} />
            </div>
          )}

          <TxLink order={o} />
        </div>
      </div>
    </li>
  );
}

function CancelOrderButton({ order: o }: { order: OrderDTO }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    const ok = window.confirm(
      'Cancel this order?\n\nIf you have already sent the payment, do NOT cancel — wait for confirmation. Once cancelled, any funds you send afterwards will not be credited automatically.',
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.cancelOrder(o.id);
      await qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order cancelled');
    } catch (err) {
      toast.error('Could not cancel', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={cancel} disabled={busy} className="action-btn-destructive">
      {busy ? <><SpinnerIcon /> Cancelling…</> : <><CloseIcon /> Cancel order</>}
    </button>
  );
}

function ResumePaymentButton({ order: o }: { order: OrderDTO }) {
  const [open, setOpen] = useState(false);
  const hasResumeData =
    !!o.pixQrCodeBase64 || !!o.cryptoQrCodeBase64 || !!o.externalCheckoutUrl;
  if (!hasResumeData) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="action-btn-primary">
        <QrIcon /> Resume payment
      </button>
      {open && <ResumePaymentModal order={o} onClose={() => setOpen(false)} />}
    </>
  );
}

/// Renders the stored QR / address from the order row so the buyer can finish
/// paying after closing the original checkout. Mirrors GatewayCheckout's
/// confirmation surface but read-only — no order-creation calls here.
function ResumePaymentModal({ order: o, onClose }: { order: OrderDTO; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [copied, setCopied] = useState<'address' | 'amount' | 'pix' | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function cancel() {
    const ok = window.confirm(
      'Cancel this order?\n\nIf you have already sent the payment, do NOT cancel — wait for confirmation. Once cancelled, any funds you send afterwards will not be credited automatically.',
    );
    if (!ok) return;
    setCancelling(true);
    try {
      await api.cancelOrder(o.id);
      await qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order cancelled');
      onClose();
    } catch (err) {
      toast.error('Could not cancel', err instanceof Error ? err.message : String(err));
    } finally {
      setCancelling(false);
    }
  }

  function copy(value: string, kind: 'address' | 'amount' | 'pix') {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(kind);
      toast.success('Copied');
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const isPix = o.paymentMethod === 'pix' && !!o.pixQrCodeBase64;
  const isCrypto = o.paymentMethod === 'crypto-gateway' && !!o.cryptoQrCodeBase64;
  const isHosted = o.paymentMethod === 'crypto-gateway' && !o.cryptoQrCodeBase64 && !!o.externalCheckoutUrl;

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center sm:justify-center bg-ipe-navy-800/60 backdrop-blur-sm animate-fade-up"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-ipe-cream-50 dark:bg-ipe-navy-800 rounded-t-xl sm:rounded-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-xl border border-ipe-stone-200 dark:border-ipe-navy-500/40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-ipe-stone-200 dark:border-ipe-navy-500/40">
          <h2 className="font-display font-semibold text-ipe-navy-700 dark:text-ipe-cream-100">
            Resume payment
          </h2>
          <button onClick={onClose} className="text-ipe-ink-50 hover:text-ipe-ink leading-none text-lg" aria-label="close">×</button>
        </header>

        <div className="p-5 space-y-4">
          {isPix && (
            <>
              <p className="text-sm text-ipe-ink/70">
                Open your bank app → Scan QR → Confirm. We auto-detect when the payment lands.
              </p>
              <img
                src={`data:image/png;base64,${o.pixQrCodeBase64}`}
                alt="PIX QR code"
                className="mx-auto w-56 h-56 rounded border border-ipe-green/10"
              />
              {o.pixQrCode && (
                <div>
                  <label className="label">Or copy &amp; paste</label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      className="input font-mono text-xs flex-1"
                      value={o.pixQrCode}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      className="btn-ghost text-xs whitespace-nowrap"
                      onClick={() => copy(o.pixQrCode!, 'pix')}
                    >
                      {copied === 'pix' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {isCrypto && (
            <>
              <p className="text-sm text-ipe-ink/70">
                Send <strong>{o.cryptoPayAmount} {(o.cryptoPayCurrency ?? '').toUpperCase()}</strong> to the address below.
              </p>
              <img
                src={o.cryptoQrCodeBase64!}
                alt={`${o.cryptoPayCurrency ?? 'crypto'} payment QR`}
                className="mx-auto w-56 h-56 rounded border border-ipe-green/10 bg-white"
              />
              {o.cryptoPayUri && (
                <a
                  href={o.cryptoPayUri}
                  className="btn-ghost w-full text-xs sm:hidden"
                  rel="noreferrer"
                >
                  Open in wallet
                </a>
              )}
              {o.cryptoPayAmount && (
                <div>
                  <label className="label">Amount</label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      className="input font-mono text-xs flex-1"
                      value={`${o.cryptoPayAmount} ${(o.cryptoPayCurrency ?? '').toUpperCase()}`}
                    />
                    <button
                      type="button"
                      className="btn-ghost text-xs whitespace-nowrap"
                      onClick={() => copy(o.cryptoPayAmount!, 'amount')}
                    >
                      {copied === 'amount' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
              {o.cryptoPayAddress && (
                <div>
                  <label className="label">Address</label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      className="input font-mono text-xs flex-1"
                      value={o.cryptoPayAddress}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      className="btn-ghost text-xs whitespace-nowrap"
                      onClick={() => copy(o.cryptoPayAddress!, 'address')}
                    >
                      {copied === 'address' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {isHosted && (
            <>
              <p className="text-sm text-ipe-ink/70">
                Reopen the hosted crypto checkout to complete this payment.
              </p>
              <a
                href={o.externalCheckoutUrl!}
                target="_blank"
                rel="noreferrer"
                className="btn-primary w-full"
              >
                Open checkout
              </a>
            </>
          )}

          <p className="text-2xs text-ipe-ink/50">
            Crypto quote may have expired (~20 min validity). If your wallet rejects the amount, contact support — we can regenerate it.
          </p>

          <div className="pt-3 border-t border-ipe-stone-200 dark:border-ipe-navy-500/30">
            <button
              type="button"
              onClick={cancel}
              disabled={cancelling}
              className="action-btn-destructive w-full justify-center"
            >
              {cancelling ? <><SpinnerIcon /> Cancelling…</> : <><CloseIcon /> Cancel this order</>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
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

function QrIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="15" width="6" height="6" rx="1" />
      <path d="M15 15h2v2M19 15v.01M15 19v2h6v-6h-2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="animate-spin" aria-hidden="true">
      <path d="M12 3a9 9 0 0 1 9 9" />
    </svg>
  );
}
