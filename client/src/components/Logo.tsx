/// Ipê Store brand mark — uses the official wordmark from /public.
/// Two PNGs/SVGs are layered: black for light mode, cream/white for dark mode.
/// Tailwind's dark: variant flips visibility so we don't need JS to detect theme.

export function Logo({ className = '', height = 28 }: { className?: string; height?: number }) {
  // Aspect ratio of the source SVG: 1599 / 500 ≈ 3.198
  const width = Math.round(height * 3.198);
  return (
    <span className={`inline-flex items-center select-none ${className}`} style={{ height }}>
      <img
        src="/logo-black.svg"
        alt="Ipê Store"
        width={width}
        height={height}
        className="block dark:hidden"
        draggable={false}
      />
      <img
        src="/logo-white.svg"
        alt="Ipê Store"
        width={width}
        height={height}
        className="hidden dark:block"
        draggable={false}
      />
    </span>
  );
}

/// Standalone flower mark — kept for the favicon path / install screens that
/// can't fit a wordmark. Lifted from the icon-source.svg geometry.
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
        <circle r="5.5" className="fill-ipe-cream-100 dark:fill-ipe-green-700" />
        <circle r="2.8" fill="currentColor" />
      </g>
    </svg>
  );
}
