import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Modal } from './Modal';
import { api, type OrderDTO, type ProductDTO } from '../api';
import { useToast } from '../lib/toast';
import { SpinnerIcon } from './AdminIcons';

interface Props {
  products: ProductDTO[];
  onClose: () => void;
  onConfirmed: () => void;
}

/// Admin in-event pickup scanner. Opens the rear camera, decodes the buyer's
/// pickup QR token, hits /verify (no state change) to show what the buyer is
/// claiming, then a "Confirm delivery" button hits /confirm to atomically flip
/// the order to delivered. Designed to handle a quick line at the event:
/// scan → confirm → next.
export function PickupScanner({ products, onClose, onConfirmed }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();
  const streamRef = useRef<MediaStream | null>(null);
  const lastDecodedRef = useRef<string | null>(null);
  const [order, setOrder] = useState<OrderDTO | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);
  const toast = useToast();
  const productById = new Map(products.map((p) => [p.id, p] as const));

  // Camera + decode loop.
  useEffect(() => {
    if (order) return; // pause loop while showing confirmation
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        scan();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Camera access denied.');
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [order]);

  function scan() {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || v.readyState < 2) {
      rafRef.current = requestAnimationFrame(scan);
      return;
    }
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (!w || !h) {
      rafRef.current = requestAnimationFrame(scan);
      return;
    }
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
    if (code?.data && code.data !== lastDecodedRef.current) {
      lastDecodedRef.current = code.data;
      void verify(code.data);
      return;
    }
    rafRef.current = requestAnimationFrame(scan);
  }

  async function verify(token: string) {
    setDecoding(true);
    setError(null);
    try {
      const o = await api.verifyPickup(token);
      // Mild haptic on a successful decode.
      try { navigator.vibrate?.(30); } catch { /* ignore */ }
      setOrder(o);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to verify';
      setError(msg);
      // Allow rescanning the same QR after an error (e.g. lost connection).
      lastDecodedRef.current = null;
    } finally {
      setDecoding(false);
    }
  }

  async function confirm() {
    if (!order) return;
    const token = lastDecodedRef.current;
    if (!token) return;
    setConfirming(true);
    setError(null);
    try {
      await api.confirmPickup(token);
      toast.success('Delivered', `${productById.get(order.productId)?.name ?? 'Order'} marked as delivered`);
      onConfirmed();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to confirm';
      setError(msg);
    } finally {
      setConfirming(false);
    }
  }

  function scanNext() {
    setOrder(null);
    setError(null);
    lastDecodedRef.current = null;
  }

  return (
    <Modal title="Pickup scanner" onClose={onClose}>
      {order ? (
        <ConfirmView
          order={order}
          product={productById.get(order.productId) ?? null}
          onConfirm={confirm}
          onScanNext={scanNext}
          confirming={confirming}
          error={error}
        />
      ) : (
        <div className="space-y-3">
          <div className="relative aspect-square sm:aspect-video bg-black rounded-md overflow-hidden">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            {/* Crosshair overlay */}
            <div aria-hidden className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-2/3 aspect-square border-2 border-ipe-gold/80 rounded-md" />
            </div>
            {decoding && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-ipe-cream-100 text-sm">
                <SpinnerIcon /> Verifying…
              </div>
            )}
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <p className="text-xs text-ipe-ink/60 text-center">
            Point the camera at the buyer's pickup QR. Detection is automatic.
          </p>
        </div>
      )}
    </Modal>
  );
}

function ConfirmView({
  order,
  product,
  onConfirm,
  onScanNext,
  confirming,
  error,
}: {
  order: OrderDTO;
  product: ProductDTO | null;
  onConfirm: () => void;
  onScanNext: () => void;
  confirming: boolean;
  error: string | null;
}) {
  const isReady = order.status === 'paid';
  const isAlreadyDelivered = order.status === 'delivered';
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-md border border-ipe-stone-200 dark:border-ipe-navy-500/30">
        <p className="text-2xs uppercase tracking-widest text-ipe-ink-50">Order</p>
        <p className="font-mono text-xs mt-0.5">{order.id}</p>
        <div className="mt-3 space-y-1">
          <p className="font-medium">
            {product?.name ?? 'Product'} <span className="text-ipe-ink/50">×{order.quantity}</span>
          </p>
          <p className="text-sm text-ipe-ink/70">{order.customerEmail ?? '—'}</p>
          {order.pickup && (
            <p className="text-xs text-ipe-ink/60">
              📍 {order.pickup.displayName || order.pickup.eventId}
            </p>
          )}
          <p className="text-xs mt-1">
            <span className="text-ipe-ink-50">Status </span>
            <strong className={
              isReady ? 'text-ipe-green-700 dark:text-ipe-gold' :
              isAlreadyDelivered ? 'text-blue-700 dark:text-blue-400' :
              'text-red-600'
            }>
              {order.status}
            </strong>
          </p>
        </div>
      </div>

      {!isReady && !isAlreadyDelivered && (
        <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded p-2.5">
          This order isn't paid yet — cannot mark as delivered. Tell the buyer to complete payment.
        </p>
      )}
      {isAlreadyDelivered && (
        <p className="text-xs text-blue-700 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded p-2.5">
          Already collected. No further action needed.
        </p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-ipe-stone-200 dark:border-ipe-navy-500/30">
        <button type="button" className="action-btn-ghost" onClick={onScanNext} disabled={confirming}>
          Scan another
        </button>
        {isReady && (
          <button className="action-btn-primary" onClick={onConfirm} disabled={confirming}>
            {confirming ? <><SpinnerIcon /> Confirming…</> : 'Confirm delivery'}
          </button>
        )}
      </div>
    </div>
  );
}
