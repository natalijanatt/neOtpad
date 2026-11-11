/**
 * Cell-level readers shared by the three dump importers.
 *
 * Every one of them answers the same question: what does an unexpected value
 * mean? The answer is never "drop it quietly" — either the value has a
 * documented reading (`2019-07` is a month, not a day) or it becomes a warning
 * on the import report, because a dataset that changed shape is something a
 * human has to look at.
 */

/** Collects everything the import wants a human to see afterwards. */
export class ImportWarnings {
  private readonly items: string[] = [];

  add(where: string, message: string): void {
    this.items.push(`${where}: ${message}`);
  }

  get messages(): readonly string[] {
    return this.items;
  }
}

export function text(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function integer(
  value: string | undefined,
  where: string,
  field: string,
  warnings: ImportWarnings,
): number | null {
  const raw = text(value);
  if (raw === null) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    warnings.add(where, `${field}: "${raw}" is not an integer, stored as NULL`);
    return null;
  }

  return parsed;
}

/**
 * A merged source row can carry one value per merged year — `ciscenja_godisnje`
 * arrives as `0;1`. The column holds a single number, and the conservative
 * reading of "cleaned zero times one year and once another" is the maximum:
 * claiming the site is never cleaned would understate the effort already spent
 * there and inflate its risk score.
 */
export function integerMax(
  value: string | undefined,
  where: string,
  field: string,
  warnings: ImportWarnings,
): number | null {
  const raw = text(value);
  if (raw === null) {
    return null;
  }

  const parts = raw.split(';').map((part) => part.trim()).filter((part) => part.length > 0);
  const numbers = parts.map(Number);

  if (numbers.some((n) => !Number.isInteger(n))) {
    warnings.add(where, `${field}: "${raw}" is not a list of integers, stored as NULL`);
    return null;
  }

  if (numbers.length > 1) {
    warnings.add(where, `${field}: "${raw}" collapsed to its maximum ${Math.max(...numbers)}`);
  }

  return numbers.length > 0 ? Math.max(...numbers) : null;
}

export function numeric(
  value: string | undefined,
  where: string,
  field: string,
  warnings: ImportWarnings,
): number | null {
  const raw = text(value);
  if (raw === null) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    warnings.add(where, `${field}: "${raw}" is not a number, stored as NULL`);
    return null;
  }

  return parsed;
}

/**
 * A single year, from a column that does not always hold one.
 *
 * `prvi_put_zabelezena` is a year in the registry rows and a full report date in
 * the Eko Alert ones (`2023-11-30`); both mean "first recorded in 2023", and the
 * exact day survives on the observation. Prose such as `pre 2004` ("before
 * 2004") is not a year at all — writing 2004 there would turn a lower bound into
 * a claim, and `godine_evidentirana` already carries the 2004 evidence.
 */
export function year(
  value: string | undefined,
  where: string,
  field: string,
  warnings: ImportWarnings,
): number | null {
  const raw = text(value);
  if (raw === null) {
    return null;
  }

  const match = /^(\d{4})(-\d{2}-\d{2})?$/.exec(raw);
  if (match === null) {
    warnings.add(where, `${field}: "${raw}" is not a year, stored as NULL`);
    return null;
  }

  return Number(match[1]);
}

/** Semicolon-separated years: `2019;2020;2021`. Sorted and de-duplicated. */
export function yearList(
  value: string | undefined,
  where: string,
  warnings: ImportWarnings,
): number[] {
  const raw = text(value);
  if (raw === null) {
    return [];
  }

  const years = new Set<number>();
  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const year = Number(trimmed);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      warnings.add(where, `godine_evidentirana: "${trimmed}" is not a year, skipped`);
      continue;
    }

    years.add(year);
  }

  return [...years].sort((a, b) => a - b);
}

/** Pipe-separated source tags: `LPUO | SEPA`. */
export function sourceList(value: string | undefined): string[] {
  const raw = text(value);
  if (raw === null) {
    return [];
  }

  return raw
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Only a full `YYYY-MM-DD` becomes a date. The registry also writes `2019-07`,
 * meaning "some time in July"; widening that to the first of the month invents
 * a day that was never recorded, and the observation's `godina` already carries
 * everything the source actually knew.
 */
export function isoDate(
  value: string | undefined,
  where: string,
  field: string,
  warnings: ImportWarnings,
): string | null {
  const raw = text(value);
  if (raw === null) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    warnings.add(where, `${field}: "${raw}" is not a full date, stored as NULL`);
    return null;
  }

  return raw;
}
