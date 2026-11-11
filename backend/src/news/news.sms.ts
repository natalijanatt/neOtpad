/**
 * How long one SMS may be.
 *
 * A GSM-7 message carries 160 characters. A single Serbian diacritic — c, c, s,
 * z, d — is outside that alphabet, so the whole message is sent as UCS-2 and the
 * limit drops to 70. The utility pays per message and per settlement, and the
 * 71st character is where one announcement quietly becomes two, so the rule is
 * enforced rather than documented.
 *
 * The same rule is a check constraint on `app.vest`; this function exists so the
 * API can explain the refusal instead of surfacing a constraint violation.
 */

/** Printable ASCII plus newlines — the safe subset of GSM-7. */
const SINGLE_BYTE = /^[\n\r\x20-\x7E]*$/;

export const SMS_LIMIT_GSM7 = 160;
export const SMS_LIMIT_UNICODE = 70;

export function smsLimit(text: string): number {
  return SINGLE_BYTE.test(text) ? SMS_LIMIT_GSM7 : SMS_LIMIT_UNICODE;
}

export function fitsOneSms(text: string): boolean {
  return text.length <= smsLimit(text);
}
