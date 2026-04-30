import { useState } from 'react';
import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';
import { erc20Abi } from 'viem';
import { IpeMarketAbi } from '@ipe/shared';
import { api } from '../api';
import { env, TOKENS, type CryptoToken } from '../config';
import { priceDisplay, formatToken } from '../lib/format';
import { ShippingForm, type ShippingFormValues } from '../components/ShippingForm';
import { PickupForm, type PickupFormValues } from '../components/PickupForm';
import { GatewayCheckout } from '../components/GatewayCheckout';
import { ProductImage } from '../components/ProductImage';
import { SkeletonBox, SkeletonText } from '../components/Skeleton';

type Step = 'idle' | 'approving' | 'buying' | 'recording' | 'done';

export function ProductPage() {
  const { id } = useParams();
  const { data: product } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.getProduct(id!),
    enabled: !!id,
  });

  const { address } = useAccount();
  const { authenticated, login } = usePrivy();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  // For the public launch, only gateway flow is exposed (PIX + crypto-via-NOWPayments).
  // The direct onchain `buy()` path still works in the contract but is hidden in the UI
  // because wallet/gas/network friction kills conversion. Flip this to true to bring it back.
  const DIRECT_PAYMENTS_ENABLED = false;

  const [paymentMethod, setPaymentMethod] = useState<'ipe' | 'usdc' | 'gateway'>(
    DIRECT_PAYMENTS_ENABLED ? 'ipe' : 'gateway',
  );
  const [delivery, setDelivery] = useState<'shipping' | 'pickup'>('pickup');
  const [showGateway, setShowGateway] = useState(false);
  const [shipping, setShipping] = useState<ShippingFormValues | null>(null);
  const [pickup, setPickup] = useState<PickupFormValues | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!product) return <ProductSkeleton />;
  const p = product;
  const tokenId = p.tokenId ? BigInt(p.tokenId) : null;

  const enabledMethods: ('ipe' | 'usdc' | 'gateway')[] = [
    DIRECT_PAYMENTS_ENABLED && BigInt(p.priceIpe) > 0n ? 'ipe' : null,
    DIRECT_PAYMENTS_ENABLED && BigInt(p.priceUsdc) > 0n ? 'usdc' : null,
    // gateway = PIX (Mercado Pago) + crypto-gateway (NOWPayments). Always enabled
    // — the actual sub-method is chosen inside the modal.
    'gateway' as const,
  ].filter((x): x is 'ipe' | 'usdc' | 'gateway' => !!x);
  // Shipping is disabled globally for the launch (pickup-only). Each product can
  // still flag `shippingAvailable: true`, but the UI gates it until logistics are wired.
  const SHIPPING_GLOBALLY_ENABLED = false;
  const enabledDeliveries: ('shipping' | 'pickup')[] = [
    SHIPPING_GLOBALLY_ENABLED && p.shippingAvailable ? 'shipping' : null,
    p.pickupAvailable ? 'pickup' : null,
  ].filter((x): x is 'shipping' | 'pickup' => !!x);

  const deliveryReady = delivery === 'shipping' ? !!shipping : !!pickup;
  const isGateway = paymentMethod === 'gateway';
  // Gateway flow doesn't require wallet/onchain product — only delivery info.
  const canSubmit = isGateway
    ? deliveryReady
    : !!address && tokenId !== null && deliveryReady && enabledMethods.includes(paymentMethod);

  async function buyCrypto(method: CryptoToken) {
    if (!address || !tokenId || !publicClient) return;
    setError(null);
    const token = TOKENS[method];
    const tokenAddress = token.address();
    const unit = method === 'ipe' ? BigInt(p.priceIpe) : BigInt(p.priceUsdc);
    const totalPrice = unit; // qty = 1 in PoC

    try {
      const allowance = (await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, env.ipeMarket],
      })) as bigint;

      if (allowance < totalPrice) {
        setStep('approving');
        const approveHash = await writeContractAsync({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'approve',
          args: [env.ipeMarket, totalPrice],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setStep('buying');
      const buyHash = await writeContractAsync({
        address: env.ipeMarket,
        abi: IpeMarketAbi,
        functionName: 'buy',
        args: [tokenId, 1n, tokenAddress],
      });
      await publicClient.waitForTransactionReceipt({ hash: buyHash });

      setStep('recording');
      await api.createOrder({
        productId: p.id,
        buyerAddress: address,
        quantity: 1,
        paymentMethod: method,
        paymentTokenAddress: tokenAddress,
        paymentRef: buyHash,
        deliveryMethod: delivery,
        shippingAddress: delivery === 'shipping' ? shipping ?? undefined : undefined,
        pickup: delivery === 'pickup' ? pickup ?? undefined : undefined,
      });
      setStep('done');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'transaction failed');
      setStep('idle');
    }
  }

  async function submit() {
    if (paymentMethod === 'gateway') {
      // Force a Privy login (email or wallet) before opening the checkout.
      // Lets us prefill email/wallet on the form and ties every order to a
      // verified identity instead of a free-text email field.
      if (!authenticated) {
        login();
        return;
      }
      setShowGateway(true);
      return;
    }
    await buyCrypto(paymentMethod);
  }

  const ctaLabel = (() => {
    switch (step) {
      case 'approving': return `Approving ${paymentMethod.toUpperCase()}…`;
      case 'buying': return 'Submitting purchase…';
      case 'recording': return 'Recording order…';
      default:
        if (paymentMethod === 'ipe') return `Buy for ${formatToken(p.priceIpe, 'IPE')}`;
        if (paymentMethod === 'usdc') return `Buy for ${formatToken(p.priceUsdc, 'USDC')}`;
        if (!authenticated) return 'Sign in to checkout';
        return `Checkout — ${priceDisplay(p)}`;
    }
  })();

  return (
    <article className="grid md:grid-cols-2 gap-6 sm:gap-10">
      <div className="card overflow-hidden aspect-square motion-in">
        <ProductImage src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
      </div>
      <div className="space-y-6 motion-in" style={{ animationDelay: '80ms' }}>
        <div>
          <p className="text-2xs font-semibold uppercase tracking-widest text-ipe-gold-600 mb-2">
            {p.category}
          </p>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-ipe-green-700 tracking-tight leading-tight">
            {p.name}
          </h1>
          <p className="text-2xl mt-3 font-mono tabular-nums text-ipe-ink">
            {priceDisplay(p)}
          </p>
          <p className="text-ipe-ink-70 mt-5 text-sm sm:text-base leading-relaxed max-w-prose">
            {p.description}
          </p>
        </div>

        {step === 'done' ? (
          <p className="text-ipe-green font-medium">
            Purchase complete — your receipt is in <a href="/orders" className="underline">My orders</a>.
          </p>
        ) : (
          <>
            {enabledMethods.length > 1 && (
              <PaymentSelector
                value={paymentMethod}
                onChange={setPaymentMethod}
                enabled={enabledMethods}
                priceIpe={p.priceIpe}
                priceUsdc={p.priceUsdc}
              />
            )}
            <DeliverySelector value={delivery} onChange={setDelivery} enabled={enabledDeliveries} />
            {delivery === 'shipping' && (
              <ShippingForm value={shipping} onChange={setShipping} />
            )}
            {delivery === 'pickup' && (
              <PickupForm value={pickup} onChange={setPickup} />
            )}

            {!isGateway && tokenId === null && (
              <p className="text-amber-700 text-xs">
                This product isn't onchain yet — pick "Pay with anything else" to checkout off-chain, or ask the admin to push it onchain.
              </p>
            )}
            {!isGateway && tokenId !== null && !address && (
              <p className="text-ipe-ink/60 text-xs">Connect your wallet to buy with {paymentMethod.toUpperCase()}.</p>
            )}
            <button className="btn-primary w-full" disabled={!canSubmit || step !== 'idle'} onClick={submit}>
              {ctaLabel}
            </button>
            {error && <p className="text-red-700 text-sm">{error}</p>}
          </>
        )}

        {showGateway && (
          <GatewayCheckout
            product={p}
            delivery={delivery}
            shipping={shipping}
            pickup={pickup}
            onClose={() => setShowGateway(false)}
          />
        )}
      </div>
    </article>
  );
}

function ProductSkeleton() {
  return (
    <article className="grid md:grid-cols-2 gap-6 sm:gap-10">
      <SkeletonBox className="aspect-square" />
      <div className="space-y-6">
        <div className="space-y-3">
          <SkeletonText className="w-20" />
          <SkeletonBox className="h-9 w-3/4" />
          <SkeletonBox className="h-7 w-32" />
          <div className="space-y-2 pt-2">
            <SkeletonText className="w-full" />
            <SkeletonText className="w-5/6" />
            <SkeletonText className="w-4/6" />
          </div>
        </div>
        <SkeletonBox className="h-24" />
        <SkeletonBox className="h-11" />
      </div>
    </article>
  );
}

interface PaymentSelectorProps {
  value: 'ipe' | 'usdc' | 'gateway';
  onChange: (v: 'ipe' | 'usdc' | 'gateway') => void;
  enabled: ('ipe' | 'usdc' | 'gateway')[];
  priceIpe: string;
  priceUsdc: string;
}

function PaymentSelector({ value, onChange, enabled, priceIpe, priceUsdc }: PaymentSelectorProps) {
  const opts = [
    { id: 'ipe' as const, label: 'IPE', sub: 'Direct onchain', price: BigInt(priceIpe) > 0n ? formatToken(priceIpe, 'IPE') : '—' },
    { id: 'usdc' as const, label: 'USDC', sub: 'Direct onchain', price: BigInt(priceUsdc) > 0n ? formatToken(priceUsdc, 'USDC') : '—' },
    { id: 'gateway' as const, label: 'Pay with anything else', sub: 'PIX or any crypto', price: BigInt(priceUsdc) > 0n ? formatToken(priceUsdc, 'USDC') : '—' },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="label">Payment</legend>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {opts.map((o) => {
          const disabled = !enabled.includes(o.id);
          const selected = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(o.id)}
              className={`relative p-3.5 rounded-md border text-left transition-all duration-250 ease-smooth ${
                selected
                  ? 'border-ipe-green-600 bg-ipe-green-50 shadow-sm'
                  : 'border-ipe-stone-200 hover:border-ipe-green-600/50 hover:bg-ipe-stone-50'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {selected && (
                <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-ipe-gold" />
              )}
              <div className="font-semibold text-ipe-ink">{o.label}</div>
              <div className="text-sm font-mono tabular-nums text-ipe-ink-70 mt-0.5">{o.price}</div>
              <div className="text-2xs uppercase tracking-wider text-ipe-ink-50 mt-1">{o.sub}</div>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function DeliverySelector({
  value, onChange, enabled,
}: {
  value: 'shipping' | 'pickup';
  onChange: (v: 'shipping' | 'pickup') => void;
  enabled: ('shipping' | 'pickup')[];
}) {
  const opts = [
    { id: 'shipping' as const, label: 'Ship to me', desc: 'Shipping address required', soon: true },
    { id: 'pickup' as const, label: 'Pick up at event', desc: 'Show your receipt at the event', soon: false },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="label">Delivery</legend>
      <div className="grid grid-cols-2 gap-2">
        {opts.map((o) => {
          const disabled = !enabled.includes(o.id) || o.soon;
          const selected = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(o.id)}
              className={`relative p-3.5 rounded-md border text-left transition-all duration-250 ease-smooth ${
                selected
                  ? 'border-ipe-green-600 bg-ipe-green-50 shadow-sm'
                  : 'border-ipe-stone-200 hover:border-ipe-green-600/50 hover:bg-ipe-stone-50'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {selected && (
                <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-ipe-gold" />
              )}
              <div className="font-semibold text-ipe-ink">{o.label}</div>
              <div className="text-2xs uppercase tracking-wider text-ipe-ink-50 mt-1">{o.desc}</div>
              {o.soon && <div className="badge-warn mt-2">soon</div>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
