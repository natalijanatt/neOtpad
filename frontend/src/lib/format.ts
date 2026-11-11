const LOCALE = 'sr-Latn-RS';

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long' });
const weekdayDateFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
const numberFormat = new Intl.NumberFormat(LOCALE);

const toDate = (value: string | Date) => (typeof value === 'string' ? new Date(value) : value);

/** "18. sep 07:30"; null kad podatak ne postoji. */
export const formatDateTime = (value: string | Date | null) =>
  value === null ? 'nema podatka' : dateTimeFormat.format(toDate(value));

/** "18. septembar" */
export const formatDate = (value: string | Date) => dateFormat.format(toDate(value));

/** "petak, 18. septembar" */
export const formatWeekdayDate = (value: string | Date) => weekdayDateFormat.format(toDate(value));

/** "07:30" */
export const formatTime = (value: string | Date) => timeFormat.format(toDate(value));

/** "1.234" */
export const formatNumber = (value: number) => numberFormat.format(value);

/**
 * "pre 3 h", "pre 2 dana", "za 5 dana" — kratko i bez biblioteke.
 *
 * Prima i null, jer podatak stvarno može da nedostaje: kontejner bez senzora
 * nema merenje, a onaj koji nikad nije ispražnjen nema poslednji odvoz.
 */
export function formatRelative(value: string | Date | null, now = Date.now()): string {
  if (value === null) return 'nema podatka';
  const diffMs = toDate(value).getTime() - now;
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  const future = diffMs > 0;

  let unit: string;
  if (minutes < 60) unit = minutes <= 1 ? '1 min' : `${minutes} min`;
  else if (hours < 24) unit = `${hours} h`;
  else if (days === 1) unit = future ? 'sutra' : 'juče';
  else unit = `${days} dana`;

  if (unit === 'sutra' || unit === 'juče') return unit;
  return future ? `za ${unit}` : `pre ${unit}`;
}

/** "za 2 dana" / "danas" / "prošlo" — za predviđeno kritično vreme. */
export function formatDaysUntil(value: string | Date | null, now = Date.now()): string {
  if (!value) return 'nije u horizontu';
  const diff = toDate(value).getTime() - now;
  if (diff <= 0) return 'sada';
  const days = Math.ceil(diff / 86_400_000);
  if (days <= 1) return 'do sutra';
  return `za ${days} dana`;
}

/**
 * „+381600000001“ → „060 000 0001“. Broj se čuva u E.164 (za `tel:` link), a
 * prikazuje onako kako ga ljudi pišu i diktiraju. Strani broj ostaje kakav jeste.
 */
export function formatPhone(e164: string): string {
  if (!e164.startsWith('+381')) return e164;
  const local = `0${e164.slice(4)}`;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}
