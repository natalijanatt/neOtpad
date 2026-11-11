/**
 * Column-level readers shared by every mapper.
 *
 * A domain model is not a row: `numeric` arrives as a string, `date` arrives as a
 * `Date` at local midnight, `bigserial` arrives as a string that must stay one.
 * Each helper below is one of those conversions, written once so that a mapper
 * cannot get it subtly wrong in its own way.
 */

/**
 * `numeric` is delivered by `pg` as a string, because not every value fits a
 * double. Ours do — coordinates, tonnes, scores, litres per 100 km — so the
 * domain carries numbers and the conversion is explicit rather than a cast.
 */
export function toNumber(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`numeric column is not a number: "${value}"`);
  }

  return parsed;
}

export function toNumberOrNull(value: string | number | null): number | null {
  return value === null ? null : toNumber(value);
}

/**
 * A `date` column, as `YYYY-MM-DD`.
 *
 * `pg` parses `date` into a `Date` at **local** midnight, so `toISOString()` on
 * it shifts the day backwards anywhere east of UTC — which is every machine that
 * will run this. Reading the local components back out is the conversion that
 * survives Belgrade time, and a date with no time is what the domain wants
 * anyway: `ociscena_datum` is a day, not an instant.
 */
export function toIsoDate(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  const year = String(value.getFullYear()).padStart(4, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function toIsoDateOrNull(value: Date | string | null): string | null {
  return value === null ? null : toIsoDate(value);
}

/**
 * A `timestamptz` column. Unlike `date` this really is an instant, and `pg`
 * already hands over a correct `Date`; the helper exists so a mapper reads the
 * same for both kinds of column and never reaches for `new Date(string)`.
 */
export function toInstant(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function toInstantOrNull(value: Date | string | null): Date | null {
  return value === null ? null : toInstant(value);
}

/**
 * `bigint`/`bigserial` stays a string all the way to the API.
 *
 * `ocitavanje.id` passes 2^53 after a few hundred sensors have been reporting for
 * long enough, and a number that silently loses its last digits is the kind of
 * bug that only shows up in production. Nothing sorts or does arithmetic on it.
 */
export function toId(value: string | number | bigint): string {
  return typeof value === 'string' ? value : String(value);
}
