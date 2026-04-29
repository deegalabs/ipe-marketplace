import { useState } from 'react';
import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { erc20Abi } from 'viem';
import { IpeMarketAbi } from '@ipe/shared';
import { api } from '../api';
import { env, TOKENS, type CryptoToken } from '../config';
import { priceDisplay, formatToken, formatBrl } from '../lib/format';
import { useCurrency } from '../lib/currency';
import { ShippingForm, type ShippingFormValues } from '../components/ShippingForm';
import { PickupForm, type PickupFormValues } from '../components/PickupForm';
import { GatewayCheckout } from '../components/GatewayCheckout';

type Step = 'idle' | 'approving' | 'buying' | 'recording' | 'done';

export function ProductPage() {
  const { id } = useParams();
  const { data: product } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.getProduct(id!),
    enabled: !!id,
  });

  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { currency, rates } = useCurrency();

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

  if (!product) return <p className="text-ipe-ink/60">Loading…</p>;
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
        return `Checkout — ${formatBrl(p.priceBrl)}`;
    }
  })();

  return (
    <article className="grid md:grid-cols-2 gap-6 sm:gap-8">
      <img src={p.imageUrl} alt={p.name} className="card aspect-square object-cover w-full" />
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-ipe-green">{p.name}</h1>
          <p className="text-xl mt-2">{priceDisplay(p, currency, rates)}</p>
          <p className="text-ipe-ink/70 mt-4 text-sm sm:text-base">{p.description}</p>
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
                priceBrl={p.priceBrl}
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

interface PaymentSelectorProps {
  value: 'ipe' | 'usdc' | 'gateway';
  onChange: (v: 'ipe' | 'usdc' | 'gateway') => void;
  enabled: ('ipe' | 'usdc' | 'gateway')[];
  priceIpe: string;
  priceUsdc: string;
  priceBrl: string;
}

function PaymentSelector({ value, onChange, enabled, priceIpe, priceUsdc, priceBrl }: PaymentSelectorProps) {
  const opts = [
    { id: 'ipe' as const, label: 'IPE', sub: 'Direct onchain', price: BigInt(priceIpe) > 0n ? formatToken(priceIpe, 'IPE') : '—' },
    { id: 'usdc' as const, label: 'USDC', sub: 'Direct onchain', price: BigInt(priceUsdc) > 0n ? formatToken(priceUsdc, 'USDC') : '—' },
    { id: 'gateway' as const, label: 'Pay with anything else', sub: 'PIX or any crypto', price: BigInt(priceBrl) > 0n ? formatBrl(priceBrl) : '—' },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="label">Payment method</legend>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {opts.map((o) => {
          const disabled = !enabled.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(o.id)}
              className={`p-3 rounded-md border text-left ${
                value === o.id
                  ? 'border-ipe-green bg-ipe-green/5'
                  : 'border-ipe-green/20 hover:border-ipe-green/40'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <div className="font-medium">{o.label}</div>
              <div className="text-xs text-ipe-ink/70">{o.price}</div>
              <div className="text-[10px] text-ipe-ink/50 mt-0.5">{o.sub}</div>
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
          return (
            <button
              key={o.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(o.id)}
              className={`p-3 rounded-md border text-left ${
                value === o.id
                  ? 'border-ipe-green bg-ipe-green/5'
                  : 'border-ipe-green/20 hover:border-ipe-green/40'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <div className="font-medium">{o.label}</div>
              <div className="text-xs text-ipe-ink/70">{o.desc}</div>
              {o.soon && <div className="text-[10px] text-amber-700 mt-1">soon</div>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
