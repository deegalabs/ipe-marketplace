import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api } from '../api';
import { formatIpe } from '../lib/format';

export function Shop() {
  const { data, isLoading, error } = useQuery({ queryKey: ['products'], queryFn: api.listProducts });

  if (isLoading) return <p className="text-ipe-ink/60">Loading shop…</p>;
  if (error) return <p className="text-red-700">Failed to load products.</p>;
  if (!data?.length) return <p className="text-ipe-ink/60">No products listed yet.</p>;

  return (
    <section>
      <h1 className="text-3xl font-bold text-ipe-green mb-6">Shop</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.filter((p) => p.active).map((p) => (
          <Link key={p.id} href={`/product/${p.id}`} className="card hover:shadow-md transition">
            <img src={p.imageUrl} alt={p.name} className="aspect-square object-cover w-full" />
            <div className="p-3">
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-ipe-ink/70">{formatIpe(p.priceIpe)}</p>
              {p.tokenId === null && (
                <p className="text-xs text-amber-700 mt-1">Not yet onchain</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
