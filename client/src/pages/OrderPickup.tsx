import { useParams, useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api';
import { SkeletonBox } from '../components/Skeleton';

/// Full-screen pickup ticket. Buyer opens this on their phone at the event
/// and the admin scans the QR. The QR encodes an HMAC-signed token verified
/// server-side, so a screenshot of someone else's order is useless without
/// also tampering with the signature.
export function OrderPickup() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { data: order, isLoading, error } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.getOrder(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="max-w-md mx-auto space-y-4 py-6">
        <SkeletonBox className="h-6 w-32" />
        <SkeletonBox className="aspect-square" />
        <SkeletonBox className="h-5 w-2/3" />
      </div>
    );
  }
  if (error || !order) {
    return (
      <div className="max-w-md mx-auto py-12 text-center">
        <p className="text-ipe-ink/60">Order not found.</p>
        <Link href="/orders" className="btn-ghost mt-4 inline-flex">Back to My orders</Link>
      </div>
    );
  }

  if (!order.pickupToken || order.deliveryMethod !== 'pickup') {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-3">
        <p className="text-ipe-ink/60">This order isn't for pickup.</p>
        <button onClick={() => navigate(`/orders`)} className="btn-ghost">Back to My orders</button>
      </div>
    );
  }

  const isDelivered = order.status === 'delivered';
  const isPaid = order.status === 'paid';
  const eventName = order.pickup?.displayName || order.pickup?.eventId || '';

  return (
    <section className="max-w-md mx-auto space-y-5 py-2 sm:py-6">
      <button
        onClick={() => navigate('/orders')}
        className="text-xs text-ipe-ink/60 hover:text-ipe-ink inline-flex items-center gap-1"
      >
        ← Back to My orders
      </button>

      <div className="card p-5 text-center space-y-5">
        <div>
          <p className="text-2xs uppercase tracking-widest text-ipe-ink-50">Pickup ticket</p>
          <h1 className="text-2xl font-display font-bold text-ipe-green-700 dark:text-ipe-cream-100 mt-1">
            {eventName || 'Event pickup'}
          </h1>
        </div>

        {isDelivered ? (
          <div className="py-6 space-y-2">
            <p className="text-4xl">✓</p>
            <p className="font-medium text-ipe-green">Already collected</p>
            <p className="text-xs text-ipe-ink/60">This order was marked delivered.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div
              className={`p-4 rounded-lg bg-white border-4 ${
                isPaid ? 'border-ipe-gold' : 'border-ipe-stone-300'
              }`}
            >
              <QRCodeSVG
                value={order.pickupToken}
                size={220}
                level="M"
                bgColor="#ffffff"
                fgColor="#002642"
                marginSize={0}
              />
            </div>
            {isPaid ? (
              <p className="text-xs text-ipe-ink/60">
                Show this to the staff at the event to collect.
              </p>
            ) : (
              <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded p-2.5">
                Status: <strong>{order.status}</strong>. The ticket is only valid once the order is paid.
              </p>
            )}
          </div>
        )}

        <div className="border-t border-ipe-stone-200 dark:border-ipe-navy-500/30 pt-4 text-left space-y-1.5 text-sm">
          <p>
            <span className="text-ipe-ink-50">Quantity </span>
            <strong>×{order.quantity}</strong>
          </p>
          <p>
            <span className="text-ipe-ink-50">Order </span>
            <span className="font-mono text-xs">{order.id.slice(0, 8)}</span>
          </p>
        </div>
      </div>

      <p className="text-2xs text-center text-ipe-ink-50">
        Keep this screen open. Brightness up helps scanning.
      </p>
    </section>
  );
}
