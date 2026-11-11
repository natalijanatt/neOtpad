/**
 * What a report photo is allowed to be, decided from the bytes.
 *
 * The declared Content-Type is attacker-controlled and is never consulted. The
 * bucket is public and serves what it is given, so a file that claims to be a
 * JPEG and is actually an SVG is stored XSS on the project's own domain, and a
 * renamed PDF is a download nobody asked for. Sniffing is the whole defence.
 */
import { randomUUID } from 'node:crypto';

export interface PhotoContent {
  mimeTip: string;
  ekstenzija: string;
}

const ASCII = (bytes: Buffer, from: number, text: string): boolean =>
  bytes.length >= from + text.length && bytes.toString('latin1', from, from + text.length) === text;

/** ISO-BMFF brands that are actually still images. An `ftyp` box alone could be video. */
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'heif', 'mif1', 'msf1']);

/**
 * iPhones shoot HEIC by default, so refusing it would refuse a large share of
 * the photos this system exists to collect.
 */
export function sniffPhoto(bytes: Buffer): PhotoContent | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeTip: 'image/jpeg', ekstenzija: 'jpg' };
  }
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mimeTip: 'image/png', ekstenzija: 'png' };
  }
  if (ASCII(bytes, 0, 'RIFF') && ASCII(bytes, 8, 'WEBP')) {
    return { mimeTip: 'image/webp', ekstenzija: 'webp' };
  }
  if (ASCII(bytes, 4, 'ftyp') && HEIF_BRANDS.has(bytes.toString('latin1', 8, 12))) {
    return { mimeTip: 'image/heic', ekstenzija: 'heic' };
  }
  return null;
}

/**
 * The object key. Server-generated end to end: no part of it comes from the
 * upload, because a client-supplied filename is how a key escapes its prefix.
 * Date segments exist so a human can find a day's uploads in the bucket without
 * a query, and so a retention sweep is a prefix scan.
 */
export function photoKey(content: PhotoContent, now: Date = new Date()): string {
  const godina = now.getUTCFullYear();
  const mesec = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `prijave/${godina}/${mesec}/${randomUUID()}.${content.ekstenzija}`;
}
