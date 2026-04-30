/// Compact 13×13 SVG icons used by admin action buttons. Keep stroke widths
/// consistent (2.2) so they read evenly at this small size.

const STROKE = 2.2;

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const PlusIcon = () => <Svg><path d="M12 5v14M5 12h14" /></Svg>;
export const PencilIcon = () => <Svg><path d="M17 3l4 4-12 12H5v-4z" /></Svg>;
export const SignOutIcon = () => (
  <Svg><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></Svg>
);
export const PrinterIcon = () => (
  <Svg><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></Svg>
);
export const UploadIcon = () => (
  <Svg><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></Svg>
);
export const RefreshIcon = () => (
  <Svg><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" /></Svg>
);
export const TruckIcon = () => (
  <Svg><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" /></Svg>
);
export const PackageCheckIcon = () => (
  <Svg><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM7.5 4.2l9 5.2M3.3 7l8.7 5 8.7-5M12 22V12M9 19l3 2 3-2" /></Svg>
);
export const UserCheckIcon = () => (
  <Svg><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17 11l2 2 4-4" /></Svg>
);
export const UserOffIcon = () => (
  <Svg><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM18 8l5 5M23 8l-5 5" /></Svg>
);
export const TrashIcon = () => (
  <Svg><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></Svg>
);
export const CloseIcon = () => <Svg><path d="M18 6L6 18M6 6l12 12" /></Svg>;
export const SpinnerIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="animate-spin" aria-hidden="true">
    <path d="M12 3a9 9 0 0 1 9 9" />
  </svg>
);
