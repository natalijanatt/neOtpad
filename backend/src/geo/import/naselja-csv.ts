/**
 * The settlement gazetteer, as `waste-scraper/data/` publishes it.
 *
 * Unlike the dump exports, these files are built by us (`scripts/build_naselja.py`)
 * out of the LPUO settlement list, JP Komunalac's collection plan and OSM, so they
 * are already regular. What this mapper adds is refusal: a settlement with no
 * coordinate, an unknown coverage value or a reference date that falls on the
 * wrong weekday is a build error upstream, and it stops here rather than becoming
 * a row somebody later trusts.
 */
import type { CsvRow } from '../../common/csv/csv';
import {
  ImportWarnings,
  integer,
  isoDate,
  numeric,
  text,
} from '../../common/csv/csv-values';
import type { Tacka } from '../../common/geo';
import type { AppTipOtpada, AppTrojstvo } from '../../database/generated/schema';

export const NASELJA_CSV_FILES = {
  naselja: 'pirot_naselja.csv',
  aliasi: 'pirot_naselja_aliasi.csv',
  raspored: 'pirot_raspored_plave_kante_2026.csv',
} as const;

/** What a source document says about collection in one settlement, on one date. */
export interface PokrivenostRow {
  izvor: string;
  izvor_url: string | null;
  godina: number;
  organizovano: AppTrojstvo;
  odvoz_nedeljno: number | null;
  broj_domacinstava: number | null;
  broj_stanovnika: number | null;
  broj_kontejnera_1100l: number | null;
}

export interface NaseljeRow {
  naziv: string;
  sifra_mesta: string | null;
  tacka: Tacka;
  kategorija_naselja: string | null;
  organizovano_prikupljanje: AppTrojstvo;
  broj_domacinstava: number | null;
  pokrivenost: PokrivenostRow | null;
}

export interface AliasRow {
  alias: string;
  naselje: string;
  izvor: string;
}

export interface RasporedRow {
  naselje: string;
  /** Street or part of a settlement; null when the row covers the whole settlement. */
  zona: string | null;
  tip_otpada: AppTipOtpada;
  dan_u_nedelji: number;
  ciklus_dana: number;
  referentni_datum: string | null;
  izvor: string;
  izvor_url: string | null;
}

const TROJSTVO: readonly AppTrojstvo[] = ['da', 'ne', 'nepoznato'];

/** What `app.plan_odvoza` accepts, mirrored from the CHECK on `ciklus_dana`. */
const CIKLUSI = new Set([7, 14, 21, 28]);

export function mapNaselja(csv: readonly CsvRow[], warnings: ImportWarnings): NaseljeRow[] {
  const rows: NaseljeRow[] = [];

  for (const [index, raw] of csv.entries()) {
    const where = `naselja row ${index + 2}`;
    const naziv = text(raw['naziv']);

    if (naziv === null) {
      warnings.add(where, 'no naziv, row skipped');
      continue;
    }

    const lat = numeric(raw['lat'], where, 'lat', warnings);
    const lon = numeric(raw['lon'], where, 'lon', warnings);

    if (lat === null || lon === null) {
      // `naselje.centroid` is NOT NULL, and rightly so: a settlement with no
      // position cannot be routed to, mapped or matched against a dump.
      warnings.add(where, `${naziv}: no centroid, row skipped`);
      continue;
    }

    const organizovano = readTrojstvo(raw['organizovano_prikupljanje'], where, warnings);
    const godina = integer(raw['pokrivenost_godina'], where, 'pokrivenost_godina', warnings);
    const izvor = text(raw['pokrivenost_izvor']);

    rows.push({
      naziv,
      sifra_mesta: text(raw['sifra_mesta']),
      tacka: { lat, lon },
      kategorija_naselja: text(raw['kategorija_lpuo']),
      organizovano_prikupljanje: organizovano,
      broj_domacinstava: integer(raw['broj_domacinstava'], where, 'broj_domacinstava', warnings),
      // No source, no snapshot. The flag on the settlement can still be
      // 'nepoznato'; what may not happen is a coverage record with nothing
      // behind it.
      pokrivenost:
        izvor === null || godina === null
          ? null
          : {
              izvor,
              izvor_url: text(raw['pokrivenost_izvor_url']),
              godina,
              organizovano,
              odvoz_nedeljno: integer(raw['odvoz_nedeljno'], where, 'odvoz_nedeljno', warnings),
              broj_domacinstava: integer(raw['broj_domacinstava'], where, 'broj_domacinstava', warnings),
              broj_stanovnika: integer(raw['broj_stanovnika_2011'], where, 'broj_stanovnika_2011', warnings),
              broj_kontejnera_1100l: integer(
                raw['broj_kontejnera_1100l'],
                where,
                'broj_kontejnera_1100l',
                warnings,
              ),
            },
    });
  }

  return rows;
}

export function mapAliasi(csv: readonly CsvRow[], warnings: ImportWarnings): AliasRow[] {
  const rows: AliasRow[] = [];

  for (const [index, raw] of csv.entries()) {
    const where = `aliasi row ${index + 2}`;
    const alias = text(raw['alias']);
    const naselje = text(raw['naselje']);
    const izvor = text(raw['izvor']);

    if (alias === null || naselje === null || izvor === null) {
      warnings.add(where, 'alias, naselje and izvor are all required, row skipped');
      continue;
    }

    rows.push({ alias, naselje, izvor });
  }

  return rows;
}

export function mapRaspored(csv: readonly CsvRow[], warnings: ImportWarnings): RasporedRow[] {
  const rows: RasporedRow[] = [];

  for (const [index, raw] of csv.entries()) {
    const where = `raspored row ${index + 2}`;
    const naselje = text(raw['naselje']);
    const dan = integer(raw['dan_u_nedelji'], where, 'dan_u_nedelji', warnings);
    const ciklus = integer(raw['ciklus_dana'], where, 'ciklus_dana', warnings) ?? 7;
    const datum = isoDate(raw['referentni_datum'], where, 'referentni_datum', warnings);
    const izvor = text(raw['izvor']);

    if (naselje === null || dan === null || izvor === null) {
      warnings.add(where, 'naselje, dan_u_nedelji and izvor are all required, row skipped');
      continue;
    }

    if (dan < 1 || dan > 7 || !CIKLUSI.has(ciklus)) {
      warnings.add(where, `dan ${dan} / ciklus ${ciklus} is outside what the table accepts, row skipped`);
      continue;
    }

    if (ciklus !== 7) {
      if (datum === null) {
        // "Every second Monday" without a date has two readings and one of them
        // sends a citizen out with a bin on the wrong week.
        warnings.add(where, `ciklus of ${ciklus} days needs a referentni_datum, row skipped`);
        continue;
      }

      if (isoWeekday(datum) !== dan) {
        warnings.add(
          where,
          `referentni_datum ${datum} is a ${isoWeekday(datum)}, not a ${dan}, row skipped`,
        );
        continue;
      }
    }

    const zona = text(raw['zona']);
    const tip = text(raw['tip_otpada']);

    rows.push({
      naselje,
      zona,
      // The file says which stream it describes; the blue bin is only the first
      // of them. Defaulting instead of guessing keeps a future green-bin file
      // from silently overwriting this one.
      tip_otpada: (tip ?? 'komunalni') as AppTipOtpada,
      dan_u_nedelji: dan,
      ciklus_dana: ciklus,
      referentni_datum: datum,
      izvor,
      izvor_url: text(raw['izvor_url']),
    });
  }

  return rows;
}

/** 1 = Monday … 7 = Sunday, matching Postgres `isodow` and the table's CHECK. */
function isoWeekday(isoDate: string): number {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function readTrojstvo(
  value: string | undefined,
  where: string,
  warnings: ImportWarnings,
): AppTrojstvo {
  const raw = text(value)?.toLowerCase() ?? null;

  if (raw !== null && (TROJSTVO as readonly string[]).includes(raw)) {
    return raw as AppTrojstvo;
  }

  if (raw !== null) {
    warnings.add(where, `organizovano_prikupljanje: unknown value "${raw}", treated as nepoznato`);
  }

  return 'nepoznato';
}
