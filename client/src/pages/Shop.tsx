import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api, type ProductDTO } from '../api';
import { priceDisplay } from '../lib/format';
import { ProductImage } from '../components/ProductImage';

export function Shop() {
  const { data, isLoading, error } = useQuery({ queryKey: ['products'], queryFn: api.listProducts });

  if (isLoading) {
    return (
      <div className="space-y-12">
        <Hero />
        <SkeletonGrid />
      </div>
    );
  }
  if (error) return <p className="text-red-700">Failed to load products.</p>;

  const items = (data ?? []).filter((p) => p.active);
  if (!items.length) {
    return (
      <div className="space-y-12">
        <Hero />
        <p className="text-ipe-ink-50 text-center py-12">No products listed yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 sm:space-y-14">
      <Hero count={items.length} />
      <ProductGrid items={items} />
    </div>
  );
}

function Hero({ count }: { count?: number }) {
  return (
    <section className="relative">
      {/* Brand blob accents — blue/lime/yellow per Brand Guide §17 */}
      <div
        aria-hidden
        className="absolute -top-20 right-0 w-96 h-96 rounded-full bg-ipe-sky/15 dark:bg-ipe-sky/20 blur-3xl pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute top-10 right-32 w-72 h-72 rounded-full bg-ipe-lime/15 dark:bg-ipe-lime/20 blur-3xl pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute -top-8 right-64 w-48 h-48 rounded-full bg-ipe-yellow/15 dark:bg-ipe-yellow/15 blur-3xl pointer-events-none"
      />
      <div className="relative max-w-3xl space-y-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ipe-lime/15 border border-ipe-lime/40">
          <span className="w-1.5 h-1.5 rounded-full bg-ipe-lime animate-pulse-subtle" />
          <span className="text-2xs font-semibold uppercase tracking-widest text-ipe-navy-600 dark:text-ipe-lime">
            Limited drop · Onchain receipts
          </span>
        </div>
        <h1 className="text-hero sm:text-display font-display text-ipe-navy-600 dark:text-ipe-cream-100 leading-[0.95]">
          Wear the city.<br />
          <span className="text-ipe-ink-70 font-medium">Carry the chain.</span>
        </h1>
        <p className="text-ipe-ink-70 text-base sm:text-lg max-w-prose leading-relaxed">
          Community merch for ipê.city — every purchase recorded on Base, paid in any currency,
          shipped from the next event.
        </p>
        {count !== undefined && (
          <div className="flex items-center gap-4 pt-2 text-2xs font-display uppercase tracking-widest text-ipe-ink-50">
            <span>{count} pieces available</span>
            <span className="w-1 h-1 rounded-full bg-ipe-ink-30" />
            <span>USD pricing</span>
            <span className="w-1 h-1 rounded-full bg-ipe-ink-30" />
            <span>Free pickup</span>
          </div>
        )}
      </div>
    </section>
  );
}

function ProductGrid({ items }: { items: ProductDTO[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
      {items.map((p, i) => (
        <ProductCard key={p.id} product={p} index={i} />
      ))}
    </div>
  );
}

function ProductCard({ product, index }: { product: ProductDTO; index: number }) {
  return (
    <Link
      href={`/product/${product.id}`}
      className="group relative block rounded-lg overflow-hidden bg-white dark:bg-ipe-green-700/40 border border-ipe-stone-200/60 dark:border-ipe-green-500/20 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-350 ease-smooth animate-fade-up"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="relative aspect-square overflow-hidden bg-ipe-stone-100 dark:bg-ipe-navy-800/40">
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-500 ease-smooth group-hover:scale-110"
        />
        {/* Soft top-bottom gradient for label readability + premium feel */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-350"
        />
        {/* Status badges, top-left */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1">
          {product.tokenId === null && (
            <span className="badge bg-amber-100/95 text-amber-800 backdrop-blur">offline</span>
          )}
        </div>
        {/* Category eyebrow, top-right */}
        <span className="absolute top-2.5 right-2.5 text-2xs font-semibold uppercase tracking-widest text-white/90 px-2 py-0.5 rounded-xs bg-ipe-ink/40 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity duration-350">
          {product.category}
        </span>
      </div>
      <div className="p-4">
        <p className="font-medium tracking-tight text-ipe-ink leading-snug line-clamp-2">{product.name}</p>
        <div className="flex items-baseline justify-between mt-2 gap-2">
          <p className="text-base font-mono font-semibold tabular-nums text-ipe-ink">
            {priceDisplay(product)}
          </p>
          <span className="text-2xs uppercase tracking-wider text-ipe-ink-50">USD</span>
        </div>
        {product.pickupAvailable && (
          <p className="mt-3 text-2xs uppercase tracking-widest text-ipe-green-700 dark:text-ipe-gold flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-ipe-green-700 dark:bg-ipe-gold" />
            Pickup at event
          </p>
        )}
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card overflow-hidden">
          <div className="aspect-square bg-ipe-stone-100 animate-pulse-subtle" />
          <div className="p-4 space-y-2">
            <div className="h-4 bg-ipe-stone-100 rounded animate-pulse-subtle w-2/3" />
            <div className="h-3 bg-ipe-stone-100 rounded animate-pulse-subtle w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
