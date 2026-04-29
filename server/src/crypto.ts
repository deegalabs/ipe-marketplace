import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from './env.js';
import type { ShippingAddress } from '@ipe/shared';

const KEY = Buffer.from(env.SHIPPING_ENCRYPTION_KEY, 'hex');
const ALGO = 'aes-256-gcm';

export function encryptAddress(address: ShippingAddress): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(address), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptAddress(blob: string): ShippingAddress {
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString('utf8')) as ShippingAddress;
}
