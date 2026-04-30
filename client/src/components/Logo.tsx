/// IPE Store brand mark — geometric ipê flower (5 radial petals).
/// Renders as inline SVG so it scales crisply and respects currentColor for
/// the petals (use `text-ipe-gold-DEFAULT` on the parent to recolor).
export function FlowerMark({ className = '', size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
    >
      <g transform="translate(32 32)">
        <g fill="currentColor">
          <ellipse cx="0" cy="-12" rx="7.5" ry="11.5" />
          <ellipse cx="0" cy="-12" rx="7.5" ry="11.5" transform="rotate(72)" />
          <ellipse cx="0" cy="-12" rx="7.5" ry="11.5" transform="rotate(144)" />
          <ellipse cx="0" cy="-12" rx="7.5" ry="11.5" transform="rotate(216)" />
          <ellipse cx="0" cy="-12" rx="7.5" ry="11.5" transform="rotate(288)" />
        </g>
        {/* Inner negative-space ring punches through the petals */}
        <circle r="5.5" className="fill-ipe-cream-100 dark:fill-ipe-green-700" />
        <circle r="2.8" fill="currentColor" />
      </g>
    </svg>
  );
}

/// Wordmark = flower + IPE STORE text. Used in the header.
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <FlowerMark className="text-ipe-gold-DEFAULT" size={28} />
      {!compact && (
        <span className="font-display font-bold text-ipe-green-600 dark:text-ipe-cream-100 text-xl tracking-tight leading-none">
          IPE <span className="text-ipe-ink dark:text-ipe-cream-100/70 font-medium">Store</span>
        </span>
      )}
    </span>
  );
}
