/**
 * A Serbian phone number as people write it → E.164, or null if it is not one.
 *
 * Admins type what is on the collector's business card: "064 123 4567",
 * "064/123-45-67", "+381 64 123 4567", "00381641234567", "010 123 456" for a
 * Pirot landline. All of them are stored as "+381641234567", which is what a
 * `tel:` link and the unique constraint both need — two spellings of one number
 * must not become two collectors.
 */
const E164_SERBIA = /^\+381[1-9]\d{7,8}$/;

export function toE164Serbia(input: string): string | null {
  let n = input.replace(/[\s\-/().]/g, '');
  if (n.startsWith('00381')) n = `+381${n.slice(5)}`;
  else if (n.startsWith('381')) n = `+${n}`;
  else if (n.startsWith('0')) n = `+381${n.slice(1)}`;
  return E164_SERBIA.test(n) ? n : null;
}
