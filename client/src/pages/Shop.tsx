import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api } from '../api';
import { priceDisplay } from '../lib/format';
import { useCurrency } from '../lib/currency';

export function Shop() {
  const { data, isLoading, error } = useQuery({ queryKey: ['products'], queryFn: api.listProducts });
  const { currency, rates } = useCurrency();

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Hero />
        <SkeletonGrid />
      </div>
    );
  }
  if (error) return <p className="text-red-700">Failed to load products.</p>;

  const items = (data ?? []).filter((p) => p.active);
  if (!items.length) {
    return (
      <div className="space-y-8">
        <Hero />
        <p className="text-ipe-ink-50 text-center py-12">No products listed yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 sm:space-y-10">
      <Hero />
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {items.map((p, i) => (
          <Link
            key={p.id}
            href={`/product/${p.id}`}
            className="card-interactive group block animate-fade-up"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="aspect-square overflow-hidden bg-ipe-stone-100">
              <img
                src={p.imageUrl}
                alt={p.name}
                className="w-full h-full object-cover transition-transform duration-350 ease-smooth group-hover:scale-105"
                loading="lazy"
              />
            </div>
            <div className="p-3 sm:p-4">
              <p className="font-medium tracking-tight text-ipe-ink leading-tight">{p.name}</p>
              <p className="text-sm text-ipe-ink-70 mt-1 font-mono tabular-nums">
                {priceDisplay(p, currency, rates)}
              </p>
              <div className="flex items-center gap-1 mt-2.5 flex-wrap">
                {p.tokenId === null && <span className="badge-warn">offline</span>}
                {p.pickupAvailable && <span className="badge-green">pickup</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="text-center sm:text-left max-w-2xl">
      <p className="text-2xs font-semibold uppercase tracking-widest text-ipe-gold-600 dark:text-ipe-gold mb-3">
        Limited drop · onchain receipts
      </p>
      <h1 className="text-hero sm:text-display font-display text-ipe-green-700 dark:text-ipe-cream-100 leading-[1.05]">
        Wear the city.
      </h1>
      <p className="mt-4 text-ipe-ink-70 dark:text-ipe-cream-100/70 text-base sm:text-lg max-w-prose">
        Community merch for ipê.city — every purchase is recorded on Base and ships from the next event.
      </p>
    </section>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card overflow-hidden">
          <div className="aspect-square bg-ipe-stone-100 animate-pulse-subtle" />
          <div className="p-3 sm:p-4 space-y-2">
            <div className="h-4 bg-ipe-stone-100 rounded animate-pulse-subtle w-2/3" />
            <div className="h-3 bg-ipe-stone-100 rounded animate-pulse-subtle w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
