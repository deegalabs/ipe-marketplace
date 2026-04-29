/// Mirror of server/src/lib/imageUrl.ts — keeps the admin form preview honest
/// without a server round-trip. The server normalizes again on save as the
/// source of truth.
const DRIVE_PATTERNS: RegExp[] = [
  /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/,
  /drive\.google\.com\/(?:uc|open|thumbnail)\?(?:[^&]+&)*id=([a-zA-Z0-9_-]{10,})/,
];

export function extractDriveFileId(input: string): string | null {
  const trimmed = input.trim();
  for (const re of DRIVE_PATTERNS) {
    const m = trimmed.match(re);
    if (m) return m[1] ?? null;
  }
  if (/^[a-zA-Z0-9_-]{25,44}$/.test(trimmed)) return trimmed;
  return null;
}

export function normalizeImageUrl(input: string, size = 1200): string {
  const id = extractDriveFileId(input);
  if (id) return `https://lh3.googleusercontent.com/d/${id}=s${size}`;
  return input.trim();
}
