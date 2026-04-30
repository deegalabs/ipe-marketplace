/// Brand-aligned line icons. All use currentColor so they recolor with text
/// utilities (text-ipe-green-700, text-ipe-cream-100, etc.) and respect
/// dark mode through the same cascade as the rest of the UI.

interface IconProps {
  className?: string;
  size?: number;
  strokeWidth?: number;
}

export function ShopIcon({ className = '', size = 24, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Bag body */}
      <path d="M5 8h14l-1 12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 8Z" />
      {/* Handles */}
      <path d="M9 8V5.5a3 3 0 0 1 6 0V8" />
    </svg>
  );
}

export function OrdersIcon({ className = '', size = 24, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Receipt outline with ticked bottom edge */}
      <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5V3Z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}
