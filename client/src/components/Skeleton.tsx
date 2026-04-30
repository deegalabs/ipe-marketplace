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
