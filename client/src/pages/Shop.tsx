import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api } from '../api';
import { priceDisplay } from '../lib/format';
import { useCurrency } from '../lib/currency';

export function Shop() {
  const { data, isLoading, error } = useQuery({ queryKey: ['products'], queryFn: api.listProducts });
  const { currency, rates } = useCurrency();

  if (isLoading) return <p className="text-ipe-ink/60">Loading shop…</p>;
  if (error) return <p className="text-red-700">Failed to load products.</p>;
  if (!data?.length) return <p className="text-ipe-ink/60">No products listed yet.</p>;

  return (
    <section>
      <h1 className="text-2xl sm:text-3xl font-bold text-ipe-green mb-4 sm:mb-6">Shop</h1>
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {data.filter((p) => p.active).map((p) => (
          <Link key={p.id} href={`/product/${p.id}`} className="card hover:shadow-md transition">
            <img src={p.imageUrl} alt={p.name} className="aspect-square object-cover w-full" />
            <div className="p-3">
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-ipe-ink/70">{priceDisplay(p, currency, rates)}</p>
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                {p.tokenId === null && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">offline</span>
                )}
                {p.pickupAvailable && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-ipe-green/10 text-ipe-green">pickup</span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
