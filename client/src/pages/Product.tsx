import { useState } from 'react';
import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { erc20Abi } from 'viem';
import { IpeMarketAbi } from '@ipe/shared';
import { api } from '../api';
import { env } from '../config';
import { formatIpe } from '../lib/format';
import { ShippingForm, type ShippingFormValues } from '../components/ShippingForm';

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
  const [step, setStep] = useState<'idle' | 'shipping' | 'approving' | 'buying' | 'recording' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [shipping, setShipping] = useState<ShippingFormValues | null>(null);

  if (!product) return <p className="text-ipe-ink/60">Loading…</p>;
  const loadedProduct = product;
  const tokenId = loadedProduct.tokenId ? BigInt(loadedProduct.tokenId) : null;

  async function buy() {
    if (!address || !shipping || !tokenId || !publicClient) return;
    setError(null);

    const totalPrice = BigInt(loadedProduct.priceIpe);
    try {
      // 1. ensure allowance
      const allowance = (await publicClient.readContract({
        address: env.ipeToken,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, env.ipeMarket],
      })) as bigint;

      if (allowance < totalPrice) {
        setStep('approving');
        const approveHash = await writeContractAsync({
          address: env.ipeToken,
          abi: erc20Abi,
          functionName: 'approve',
          args: [env.ipeMarket, totalPrice],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // 2. buy
      setStep('buying');
      const buyHash = await writeContractAsync({
        address: env.ipeMarket,
        abi: IpeMarketAbi,
        functionName: 'buy',
        args: [tokenId, 1n],
      });
      await publicClient.waitForTransactionReceipt({ hash: buyHash });

      // 3. record off-chain order with shipping
      setStep('recording');
      await api.createOrder({
        productId: loadedProduct.id,
        buyerAddress: address,
        quantity: 1,
        txHash: buyHash,
        shippingAddress: shipping,
      });
      setStep('done');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'transaction failed');
      setStep('idle');
    }
  }

  return (
    <article className="grid md:grid-cols-2 gap-8">
      <img src={loadedProduct.imageUrl} alt={loadedProduct.name} className="card aspect-square object-cover" />
      <div>
        <h1 className="text-3xl font-bold text-ipe-green">{loadedProduct.name}</h1>
        <p className="text-xl mt-2">{formatIpe(loadedProduct.priceIpe)}</p>
        <p className="text-ipe-ink/70 mt-4">{loadedProduct.description}</p>

        {tokenId === null ? (
          <p className="mt-6 text-amber-700 text-sm">
            This product hasn't been pushed onchain yet. Ask the admin to call <code>listProduct</code>.
          </p>
        ) : !address ? (
          <p className="mt-6 text-ipe-ink/60 text-sm">Connect your wallet to buy.</p>
        ) : step === 'done' ? (
          <p className="mt-6 text-ipe-green font-medium">
            Purchase complete — your receipt is in <a href="/orders" className="underline">My orders</a>.
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            <ShippingForm value={shipping} onChange={(v) => { setShipping(v); setStep('shipping'); }} />
            <button
              className="btn-primary w-full"
              disabled={!shipping || step === 'approving' || step === 'buying' || step === 'recording'}
              onClick={buy}
            >
              {step === 'approving'
                ? 'Approving IPE…'
                : step === 'buying'
                  ? 'Submitting purchase…'
                  : step === 'recording'
                    ? 'Recording order…'
                    : `Buy for ${formatIpe(loadedProduct.priceIpe)}`}
            </button>
            {error && <p className="text-red-700 text-sm">{error}</p>}
          </div>
        )}
      </div>
    </article>
  );
}
