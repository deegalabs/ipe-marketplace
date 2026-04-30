/// Ipê Store brand mark — uses the official wordmark from /public.
/// Two SVGs are layered: black for light mode, off-white for dark mode.

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

/// Standalone brand symbol (Brand Guide §07): a stylized chevron / roof
/// extracted from the "i" of the ipê wordmark — also evokes the diacritic on
/// "ipê" and a peaked roof. Used for favicons, install icons, and tight
/// surfaces where the full wordmark won't fit.
export function ChevronMark({ className = '', size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
    >
      {/* Path traces the official chevron — two thick rounded strokes meeting at apex.
          currentColor lets the symbol take on the surrounding text color. */}
      <path
        d="M10 44 L32 22 L54 44 L46 44 L32 30 L18 44 Z"
        fill="currentColor"
      />
    </svg>
  );
}

/// Backwards-compat: components that imported FlowerMark continue to work,
/// now rendering the official chevron mark.
export const FlowerMark = ChevronMark;
