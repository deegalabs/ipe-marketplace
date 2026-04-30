import { useState } from 'react';

interface Props {
  src: string;
  alt: string;
  className?: string;
}

/// Renders the product image with a brand-tinted placeholder fallback.
/// The placeholder shows when:
///   - imageUrl is empty (admin saved without an image)
///   - the image 404s or otherwise fails to load
///
/// Placeholder = soft brand gradient (sky/lime/yellow over navy) with the
/// product name centered. Same vibe as the icon-source.svg.
export function ProductImage({ src, alt, className = '' }: Props) {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;

  if (showFallback) {
    return (
      <div
        className={`relative w-full h-full overflow-hidden bg-ipe-navy-600 flex items-center justify-center text-center px-4 ${className}`}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(circle at 25% 30%, #3aa5ff 0%, transparent 50%), radial-gradient(circle at 75% 70%, #a2d729 0%, transparent 50%), radial-gradient(circle at 60% 20%, #ffb600 0%, transparent 35%)',
          }}
        />
        <span className="relative font-display font-bold text-ipe-cream-100 text-lg sm:text-xl tracking-tight leading-tight drop-shadow-sm break-words max-w-full">
          {alt || 'Product'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className={className}
      loading="lazy"
    />
  );
}
