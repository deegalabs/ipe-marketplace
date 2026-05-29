/// Tiny skeleton primitives for loading states. Match the shape of the final
/// content so the layout doesn't jump when data arrives. Uses tailwind's
/// pulse animation (already configured) over a neutral surface that adapts
/// in dark mode.

interface SkeletonProps {
  className?: string;
}

export function SkeletonBox({ className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={`animate-pulse-subtle bg-ipe-stone-100 dark:bg-ipe-navy-700/50 rounded-md ${className}`}
    />
  );
}

export function SkeletonText({ className = '' }: SkeletonProps) {
  return <SkeletonBox className={`h-3 ${className}`} />;
}

export function SkeletonCircle({ className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={`animate-pulse-subtle bg-ipe-stone-100 dark:bg-ipe-navy-700/50 rounded-full ${className}`}
    />
  );
}

/// Brand-tinted spinner. Use for in-button loading and small inline waits.
/// For full-page or full-card loads, prefer skeletons that match the final
/// layout — they feel faster than spinners (Nielsen, response time §10).
export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      className={`animate-spin ${className}`}
      aria-hidden="true"
      role="status"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

/// Centered spinner with a label — for page-level "loading…" states where a
/// skeleton would be awkward (e.g. auth check, redirect interstitial).
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-ipe-ink-50">
      <Spinner size={28} className="text-ipe-gold" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/// Thin progress bar at the very top of the viewport, indicating a
/// background refetch is in progress. Sub-pixel so it doesn't shift layout.
export function TopProgressBar({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      className={`fixed top-0 left-0 right-0 h-0.5 z-[60] pointer-events-none transition-opacity duration-300 ${
        active ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="h-full bg-gradient-to-r from-transparent via-ipe-gold to-transparent animate-progress-slide" />
    </div>
  );
}
