import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { api } from '../api';
import type { ProductDTO } from '../api';
import type { ShippingFormValues } from './ShippingForm';
import type { PickupFormValues } from './PickupForm';

type GatewayMethod = 'pix' | 'crypto-gateway';

interface Props {
  product: ProductDTO;
  delivery: 'shipping' | 'pickup';
  shipping: ShippingFormValues | null;
  pickup: PickupFormValues | null;
  onClose: () => void;
}

/// Two-step gateway checkout: collect email/wallet/method first, then show
/// the appropriate confirmation surface (PIX QR or "open hosted page" for crypto).
export function GatewayCheckout({ product, delivery, shipping, pickup, onClose }: Props) {
  const { address: connected } = useAccount();
  const [method, setMethod] = useState<GatewayMethod>('pix');
  const [email, setEmail] = useState('');
  const [wallet, setWallet] = useState(connected ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [pix, setPix] = useState<{ qrCode: string; qrCodeBase64: string } | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  // Poll order status while we're in the awaiting-payment state.
  const { data: orderState } = useQuery({
    queryKey: ['order-poll', orderId],
    queryFn: () => api.getOrder(orderId!),
    enabled: !!orderId,
    refetchInterval: (q) => (q.state.data?.status === 'awaiting_payment' ? 3000 : false),
  });

  // Live USD↔BRL rate for the PIX preview total. Server does the same conversion
  // authoritatively at order-creation time — this is just so the buyer sees the
  // amount before they click "Generate PIX QR".
  const { data: rates } = useQuery({
    queryKey: ['rates'],
    queryFn: api.rates,
    refetchInterval: 60_000,
    enabled: method === 'pix',
  });

  const usdAmount = Number(BigInt(product.priceUsdc)) / 1e6;
  const brlPreview = rates?.usdcBrl
    ? `R$ ${(usdAmount * Number(rates.usdcBrl)).toFixed(2).replace('.', ',')}`
    : '…';
  const totalLabel = method === 'pix' ? brlPreview : `~$${usdAmount.toFixed(2)} USD`;

  async function submit() {
    if (!email) { setError('Email is required.'); return; }
    if (wallet && !/^0x[a-fA-F0-9]{40}$/.test(wallet)) { setError('Wallet looks invalid.'); return; }
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.createGatewayOrder({
        productId: product.id,
        customerEmail: email,
        buyerAddress: wallet || undefined,
        quantity: 1,
        paymentMethod: method,
        deliveryMethod: delivery,
        shippingAddress: delivery === 'shipping' ? (shipping ?? undefined) : undefined,
        pickup: delivery === 'pickup' ? (pickup ?? undefined) : undefined,
      });
      setOrderId(res.orderId);
      if (res.pix) setPix(res.pix);
      if (res.checkoutUrl) {
        setCheckoutUrl(res.checkoutUrl);
        window.open(res.checkoutUrl, '_blank', 'noopener');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to create checkout');
    } finally {
      setSubmitting(false);
    }
  }

  // Auto-close when payment confirms.
  useEffect(() => {
    if (orderState?.status === 'paid') {
      const t = setTimeout(() => onClose(), 1500);
      return () => clearTimeout(t);
    }
  }, [orderState?.status, onClose]);

  // Portal to body so the modal isn't trapped inside any ancestor that has a
  // transform/filter (which would turn the fixed positioning into "fixed
  // relative to the ancestor" — effectively absolute inside the product card).
  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center sm:justify-center bg-ipe-navy-800/60 backdrop-blur-sm animate-fade-up"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-ipe-navy-700 rounded-t-xl sm:rounded-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-xl border border-ipe-stone-200 dark:border-ipe-navy-500/40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-ipe-stone-200 dark:border-ipe-navy-500/40">
          <h2 className="font-display font-semibold text-ipe-navy-700 dark:text-ipe-cream-100">Pay with anything else</h2>
          <button onClick={onClose} className="text-ipe-ink-50 hover:text-ipe-ink leading-none text-lg" aria-label="close">×</button>
        </header>

        {!orderId ? (
          <div className="p-5 space-y-4">
            <fieldset className="space-y-2">
              <legend className="label">Method</legend>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'pix' as const, label: 'PIX', desc: 'Brazilian instant payment' },
                  { id: 'crypto-gateway' as const, label: 'Crypto', desc: 'BTC, ETH, USDT…' },
                ]).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setMethod(o.id)}
                    className={`p-3 rounded-md border text-left ${
                      method === o.id
                        ? 'border-ipe-green bg-ipe-green/5'
                        : 'border-ipe-green/20 hover:border-ipe-green/40'
                    }`}
                  >
                    <div className="font-medium">{o.label}</div>
                    <div className="text-xs text-ipe-ink/70">{o.desc}</div>
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <label className="label">Email (required)</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <p className="text-xs text-ipe-ink/60 mt-1">We'll send your receipt and shipping/pickup updates here.</p>
            </div>

            <div>
              <label className="label">Wallet (optional)</label>
              <input
                className="input font-mono text-xs"
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="0x… (paste to receive your onchain receipt)"
              />
              <p className="text-xs text-ipe-ink/60 mt-1">
                If provided, we'll mint your 1155 receipt to this address after payment confirms. Skip to keep it simple.
              </p>
            </div>

            <p className="text-sm">Total: <strong>{totalLabel}</strong></p>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button className="btn-primary w-full" onClick={submit} disabled={submitting}>
              {submitting ? 'Creating…' : method === 'pix' ? 'Generate PIX QR' : 'Open crypto checkout'}
            </button>
          </div>
        ) : (
          <ConfirmationView
            method={method}
            pix={pix}
            checkoutUrl={checkoutUrl}
            status={orderState?.status ?? 'awaiting_payment'}
            orderId={orderId}
            onClose={onClose}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmationViewProps {
  method: GatewayMethod;
  pix: { qrCode: string; qrCodeBase64: string } | null;
  checkoutUrl: string | null;
  status: string;
  orderId: string;
  onClose: () => void;
}

function ConfirmationView({ method, pix, checkoutUrl, status, orderId, onClose }: ConfirmationViewProps) {
  const isLocalhost = typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.hostname);

  if (status === 'paid') {
    return (
      <div className="p-6 text-center space-y-3">
        <p className="text-3xl">✅</p>
        <p className="text-ipe-green font-medium">Payment confirmed</p>
        <p className="text-sm text-ipe-ink/70">Your order is on the way.</p>
        <button className="btn-ghost text-xs" onClick={onClose}>Close</button>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      {method === 'pix' && pix ? (
        <>
          <p className="text-sm text-ipe-ink/70">
            Open your bank app → Scan QR → Confirm. We auto-detect when the payment lands.
          </p>
          <img
            src={`data:image/png;base64,${pix.qrCodeBase64}`}
            alt="PIX QR code"
            className="mx-auto w-56 h-56 rounded border border-ipe-green/10"
          />
          <details>
            <summary className="text-sm text-ipe-green cursor-pointer">Or copy &amp; paste</summary>
            <textarea
              readOnly
              className="input mt-2 font-mono text-xs"
              rows={3}
              value={pix.qrCode}
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />
          </details>
        </>
      ) : checkoutUrl ? (
        <>
          <p className="text-sm text-ipe-ink/70">
            We opened the crypto checkout in a new tab. Complete the payment there. We auto-detect when it lands.
          </p>
          <a href={checkoutUrl} target="_blank" rel="noreferrer" className="btn-primary w-full">
            Reopen checkout
          </a>
        </>
      ) : null}

      <div className="flex items-center gap-2 text-sm text-ipe-ink/60">
        <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        Waiting for payment confirmation…
      </div>

      {isLocalhost && (
        <button
          className="text-xs text-ipe-ink/40 underline"
          onClick={async () => {
            await api.devConfirmGatewayOrder(orderId);
          }}
        >
          [dev] simulate webhook
        </button>
      )}
    </div>
  );
}
