import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { env, features } from '../env.js';

export class StorageUnavailable extends Error {
  constructor() {
    super('Storage is not configured (SUPABASE_URL + SUPABASE_SERVICE_KEY required)');
  }
}

let _client: SupabaseClient | null = null;
function client(): SupabaseClient {
  if (_client) return _client;
  if (!features.uploads) throw new StorageUnavailable();
  _client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

/// Allowed MIME types for product images. PNG/JPEG/WebP cover everything
/// modern; SVG is excluded because it can carry inline scripts and our shop
/// renders these into `<img>` (the browser executes them in some contexts).
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/// Sniff the real image type from magic bytes. The client-declared content-type
/// (from multer) is attacker-controlled, so we never trust it — a file claiming
/// image/png could carry HTML/SVG. Returns null when the bytes match no known
/// raster image, which we then reject.
function sniffImageMime(b: Buffer): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

interface UploadArgs {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

interface UploadResult {
  url: string;
  /// Storage key inside the bucket (e.g. "abc-123.png"). Stored alongside the
  /// URL would let us delete on product replacement, but we don't yet.
  path: string;
}

/// Upload a product image to Supabase Storage and return the public URL.
/// File name is a UUID + extension from the MIME type — we discard the
/// original filename so admin can drop any sketchy `foo.png; rm -rf` in.
export async function uploadProductImage(args: UploadArgs): Promise<UploadResult> {
  // Validate by real magic bytes, not the client-declared content-type.
  const mime = sniffImageMime(args.buffer);
  if (!mime || !ALLOWED_MIME.has(mime)) {
    throw new Error('unsupported or invalid image file');
  }
  const ext = mime.split('/')[1].replace('jpeg', 'jpg');
  const path = `${randomUUID()}.${ext}`;

  const sb = client();
  const { error } = await sb.storage
    .from(env.SUPABASE_PRODUCTS_BUCKET)
    .upload(path, args.buffer, {
      contentType: mime,
      // Don't allow overwrite — the UUID path makes collisions impossible,
      // but defense in depth.
      upsert: false,
      cacheControl: '31536000',
    });
  if (error) throw new Error(`storage upload failed: ${error.message}`);

  const { data } = sb.storage.from(env.SUPABASE_PRODUCTS_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}
