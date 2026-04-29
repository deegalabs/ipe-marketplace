/**
 * Normalizes user-supplied image URLs so they actually render in <img> tags.
 *
 * The big offender is Google Drive: the "share" URL (drive.google.com/file/d/.../view)
 * is an HTML page, not an image. We extract the file id and rewrite to
 *   https://lh3.googleusercontent.com/d/{id}=s1200
 * which Google serves directly with image/* content type and works on hotlinks.
 *
 * Anything not matching a Drive pattern is passed through untouched.
 */

const DRIVE_PATTERNS: RegExp[] = [
  // https://drive.google.com/file/d/{id}/view?usp=...
  /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/,
  // https://drive.google.com/uc?export=view&id={id} (any param order)
  /drive\.google\.com\/(?:uc|open|thumbnail)\?(?:[^&]+&)*id=([a-zA-Z0-9_-]{10,})/,
  // https://drive.google.com/drive/folders/... — NOT supported (folder, not file)
  // we deliberately don't match this to avoid producing broken URLs.
];

/// Pull a Drive file id from any of the supported share URL formats, or accept
/// a bare id (e.g. "1aB2cD3eF...") if that's what the admin pasted.
export function extractDriveFileId(input: string): string | null {
  const trimmed = input.trim();
  for (const re of DRIVE_PATTERNS) {
    const m = trimmed.match(re);
    if (m) return m[1] ?? null;
  }
  // Bare id heuristic: 25-44 chars, base64 url-safe charset, no slashes.
  if (/^[a-zA-Z0-9_-]{25,44}$/.test(trimmed)) return trimmed;
  return null;
}

/// `size` controls the thumbnail width (Google ignores the `=s` suffix on huge
/// values). 1200 is fine for product cards on retina displays.
export function normalizeImageUrl(input: string, size = 1200): string {
  const driveId = extractDriveFileId(input);
  if (driveId) return `https://lh3.googleusercontent.com/d/${driveId}=s${size}`;
  return input.trim();
}
