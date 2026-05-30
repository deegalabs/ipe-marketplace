import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';

/// Compact signed token shown to buyers as a QR for in-person pickup. Format:
///
///   <orderId>.<sig>
///
/// `sig` is a base64url-encoded HMAC-SHA256 of the order id, using the
/// shipping encryption key as the secret (re-using an existing high-entropy
/// env var instead of adding another secret). 12 bytes of the HMAC is plenty
/// for our threat model: an attacker who controls a buyer's display still
/// has to guess a 96-bit MAC.
///
/// The token is verified server-side before flipping the order to delivered,
/// so admins never trust the buyer's screen as the source of truth.

const TOKEN_BYTES = 12;

export function pickupToken(orderId: string): string {
  return `${orderId}.${sign(orderId)}`;
}

export function verifyPickupToken(token: string): string | null {
  const idx = token.indexOf('.');
  if (idx < 0) return null;
  const orderId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  if (!orderId || !sig) return null;
  const expected = sign(orderId);
  // Constant-time compare to avoid leaking which prefix bytes matched.
  if (sig.length !== expected.length) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  try {
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return orderId;
}

function sign(orderId: string): string {
  return createHmac('sha256', env.SHIPPING_ENCRYPTION_KEY)
    .update(orderId)
    .digest('base64url')
    .slice(0, TOKEN_BYTES * 2); // 12 raw bytes → 16 base64url chars
}
