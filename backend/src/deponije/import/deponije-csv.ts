/**
 * CSV rows from `waste-scraper/data/` to rows the `app.deponija_*` tables will
 * accept.
 *
 * This file is where the traps listed in docs/data-sources.md stop being prose.
 * It is deliberately free of Kysely and of NestJS: it turns text into data, the
 * repository turns data into SQL, and the mapping rules stay unit-testable
 * without a database.
 */
import type {
  AppGeoPreciznost,
  AppPouzdanostSpajanja,
  AppTrojstvo,
} from '../../database/generated/schema';
import type { CsvRow } from '../../common/csv/csv';
import type { Tacka } from '../../common/geo';
import {
  ImportWarnings,
  integer,
  integerMax,
  isoDate,
  numeric,
  sourceList,
  text,
  year,
  yearList,
} from '../../common/csv/csv-values';

export type { Tacka };

/** The names in the sources are raw text; only the importer can turn one into an id. */
export type Resolved<T> = T & { naselje_id: string | null };

/** File names as the scraper writes them, in the order the foreign keys need. */
export const DEPONIJE_CSV_FILES = {
  kanonske: 'pirot_divlje_deponije_kanonske.csv',
  lokacije: 'pirot_divlje_deponije_lokacije.csv',
  opservacije: 'pirot_divlje_deponije_opservacije.csv',
} as const;

export interface KanonskaRow {
  kanonski_id: string;
  naziv: string | null;
  naselje: string | null;
  tacka: Tacka | null;
  geo_preciznost: AppGeoPreciznost;
  prvi_put_zabelezena: number | null;
  poslednji_put_zabelezena: number | null;
  godine_evidentirana: number[];
  izvori: string[];
  broj_izvornih_redova: number;
  broj_opservacija: number;
  ponovo_se_stvara: AppTrojstvo;
  status: string | null;
  spajanje_pouzdanost: AppPouzdanostSpajanja | null;
}

export interface LokacijaRow {
  location_id: string;
  kanonski_id: string | null;
  naziv: string | null;
  naselje: string | null;
  tacka: Tacka | null;
  geo_preciznost: AppGeoPreciznost;
  katastarska_parcela: string | null;
  katastarska_opstina: string | null;
  prvi_put_zabelezena: number | null;
  poslednji_put_zabelezena: number | null;
  godine_evidentirana: number[];
  tip_otpada_opis: string | null;
  povrsina_m2: number | null;
  zapremina_m3: number | null;
  kolicina_t: number | null;
  ciscenja_godisnje: number | null;
  ociscena_datum: string | null;
  ponovo_se_stvara: AppTrojstvo;
  status: string | null;
  izvor: string;
  izvor_url: string | null;
  napomena: string | null;
  spajanje_pouzdanost: AppPouzdanostSpajanja | null;
  spajanje_razlog: string | null;
}

export interface OpservacijaRow {
  location_id: string | null;
  kanonski_id: string | null;
  datum: string | null;
  godina: number;
  tip_dogadjaja: string;
  tacka: Tacka | null;
  povrsina_m2: number | null;
  zapremina_m3: number | null;
  kolicina_t: number | null;
  broj_deponija: number;
  izvor: string;
  izvor_url: string | null;
  opis: string | null;
}

/**
 * The exports distinguish seven precisions; `app.geo_preciznost` has four. The
 * five collapsed into `geokodirano` are all coordinates derived from a text
 * description — a street name, a rough zone, the city centre, a citizen report —
 * as opposed to a surveyed registry point or a settlement centroid. That is the
 * distinction the enum exists to protect; the finer shades never carried enough
 * certainty to mean anything different downstream.
 */
const GEO_PRECIZNOST: Readonly<Record<string, AppGeoPreciznost>> = {
  registarska_tacka: 'registarska_tacka',
  centroid_naselja: 'centroid_naselja',
  ulica: 'geokodirano',
  centar_grada: 'geokodirano',
  priblizno_naselje: 'geokodirano',
  priblizno_zona: 'geokodirano',
  prijava_gradjanina: 'geokodirano',
  nepoznato: 'nepoznato',
};

/**
 * Eko Alert's form pre-fills this point when the reporter gives no location. It
 * is the reporting site's default, not a place, so it becomes an explicit
 * "unknown" rather than a dump pinned to a field north of Pirot.
 */
const EKO_ALERT_DEFAULT: Tacka = { lat: 43.1682819, lon: 22.5956678 };

/** Roughly 0.1 m — far below any precision these sources ever had. */
const COORD_EPSILON = 1e-6;

/**
 * Observations the source itself describes as more than one dump.
 *
 * `broj_deponija` has no column in the exports, so without this list every count
 * drawn from the table would silently read "desetak deponija" (about ten dumps,
 * EKOALERT-30, on the road from the reservoir towards Izvor) as one. The figure
 * comes from the report text kept verbatim in `opis`; like every count here it
 * is a lower bound, not a survey.
 */
const VISESTRUKE_DEPONIJE: Readonly<Record<string, number>> = {
  'EKOALERT-30': 10,
};

export function mapKanonske(csv: readonly CsvRow[], warnings: ImportWarnings): KanonskaRow[] {
  const rows: KanonskaRow[] = [];

  for (const [index, raw] of csv.entries()) {
    const where = `kanonske row ${index + 2}`;
    const kanonskiId = text(raw['kanonski_id']);

    if (kanonskiId === null) {
      warnings.add(where, 'no kanonski_id, row skipped');
      continue;
    }

    const { tacka, geo_preciznost } = readTacka(raw, where, warnings);

    rows.push({
      kanonski_id: kanonskiId,
      naziv: text(raw['naziv']),
      naselje: text(raw['naselje']),
      tacka,
      geo_preciznost,
      prvi_put_zabelezena: year(raw['prvi_put_zabelezena'], where, 'prvi_put_zabelezena', warnings),
      poslednji_put_zabelezena: year(
        raw['poslednji_put_zabelezena'],
        where,
        'poslednji_put_zabelezena',
        warnings,
      ),
      godine_evidentirana: yearList(raw['godine_evidentirana'], where, warnings),
      izvori: sourceList(raw['izvori']),
      broj_izvornih_redova:
        integer(raw['broj_izvornih_redova'], where, 'broj_izvornih_redova', warnings) ?? 1,
      broj_opservacija: integer(raw['broj_opservacija'], where, 'broj_opservacija', warnings) ?? 0,
      ponovo_se_stvara: readTrojstvo(raw['ponovo_se_stvara'], where, warnings),
      status: text(raw['status']),
      spajanje_pouzdanost: readPouzdanost(raw['spajanje_pouzdanost'], where, warnings),
    });

    // Aggregates the export also carries (povrsina_m2, zapremina_m3, kolicina_t,
    // ociscena_datum, katastarska_parcela) are deliberately not stored on the
    // canonical row: each is the maximum or the pick of the source rows merged
    // into it, and those rows land in app.deponija_lokacija with their own
    // provenance. One number, one owner.
  }

  return rows;
}

export function mapLokacije(csv: readonly CsvRow[], warnings: ImportWarnings): LokacijaRow[] {
  const rows: LokacijaRow[] = [];

  for (const [index, raw] of csv.entries()) {
    const where = `lokacije row ${index + 2}`;
    const locationId = text(raw['location_id']);

    if (locationId === null) {
      warnings.add(where, 'no location_id, row skipped');
      continue;
    }

    const izvor = text(raw['izvor']);
    if (izvor === null) {
      warnings.add(where, 'no izvor, row skipped — provenance is not optional here');
      continue;
    }

    const { tacka, geo_preciznost } = readTacka(raw, where, warnings);

    rows.push({
      location_id: locationId,
      kanonski_id: text(raw['kanonski_id']),
      naziv: text(raw['naziv']),
      naselje: text(raw['naselje']),
      tacka,
      geo_preciznost,
      katastarska_parcela: text(raw['katastarska_parcela']),
      katastarska_opstina: text(raw['katastarska_opstina']),
      prvi_put_zabelezena: year(raw['prvi_put_zabelezena'], where, 'prvi_put_zabelezena', warnings),
      poslednji_put_zabelezena: year(
        raw['poslednji_put_zabelezena'],
        where,
        'poslednji_put_zabelezena',
        warnings,
      ),
      godine_evidentirana: yearList(raw['godine_evidentirana'], where, warnings),
      // Registry prose such as "komunalni (registar ne specificira)" stays prose.
      // Forcing it into app.tip_otpada would invent a certainty the source never had.
      tip_otpada_opis: text(raw['tip_otpada']),
      povrsina_m2: numeric(raw['povrsina_m2'], where, 'povrsina_m2', warnings),
      zapremina_m3: numeric(raw['zapremina_m3'], where, 'zapremina_m3', warnings),
      kolicina_t: numeric(raw['kolicina_t'], where, 'kolicina_t', warnings),
      ciscenja_godisnje: integerMax(raw['ciscenja_godisnje'], where, 'ciscenja_godisnje', warnings),
      ociscena_datum: isoDate(raw['ociscena_datum'], where, 'ociscena_datum', warnings),
      ponovo_se_stvara: readTrojstvo(raw['ponovo_se_stvara'], where, warnings),
      status: text(raw['status']),
      izvor,
      izvor_url: text(raw['izvor_url']),
      napomena: text(raw['napomena']),
      spajanje_pouzdanost: readPouzdanost(raw['spajanje_pouzdanost'], where, warnings),
      spajanje_razlog: text(raw['spajanje_razlog']),
    });

    // `grad` is 'Pirot' on every row, `broj_opservacija` is a count of the
    // observation table, and `povezano_sa` / `povezano_rastojanje_m` are the
    // de-duplication's working notes — the distance they record is already
    // spelled out in spajanje_razlog, and the link itself is the kanonska_id FK.
  }

  return rows;
}

export function mapOpservacije(csv: readonly CsvRow[], warnings: ImportWarnings): OpservacijaRow[] {
  const rows: OpservacijaRow[] = [];

  for (const [index, raw] of csv.entries()) {
    const where = `opservacije row ${index + 2}`;
    const godina = integer(raw['godina'], where, 'godina', warnings);

    if (godina === null) {
      warnings.add(where, 'no godina, row skipped — an observation outside time is unusable');
      continue;
    }

    const tipDogadjaja = text(raw['tip_dogadjaja']);
    if (tipDogadjaja === null) {
      warnings.add(where, 'no tip_dogadjaja, row skipped');
      continue;
    }

    const locationId = text(raw['location_id']);

    rows.push({
      location_id: locationId,
      kanonski_id: text(raw['kanonski_id']),
      datum: isoDate(raw['datum'], where, 'datum', warnings),
      godina,
      // Left as text on purpose: the exports already use nine event types
      // (ciscenje, popis_u_planu, geodetski_snimak, …) and the next document read
      // will add a tenth. An enum here would mean a migration per source.
      tip_dogadjaja: tipDogadjaja,
      // An observation records where the source put the dump on that date. The
      // export carries no precision flag for it — the flag belongs to the
      // location the observation is attached to — so only the placeholder check
      // applies here.
      tacka: readCoordinates(raw, where, warnings),
      povrsina_m2: numeric(raw['povrsina_m2'], where, 'povrsina_m2', warnings),
      zapremina_m3: numeric(raw['zapremina_m3'], where, 'zapremina_m3', warnings),
      kolicina_t: numeric(raw['kolicina_t'], where, 'kolicina_t', warnings),
      broj_deponija: (locationId === null ? undefined : VISESTRUKE_DEPONIJE[locationId]) ?? 1,
      izvor: text(raw['izvor']) ?? 'nepoznato',
      izvor_url: text(raw['izvor_url']),
      opis: text(raw['opis']),
    });
  }

  for (const locationId of Object.keys(VISESTRUKE_DEPONIJE)) {
    if (!csv.some((raw) => text(raw['location_id']) === locationId)) {
      warnings.add(
        'opservacije',
        `${locationId} is recorded here as a multi-dump observation but no longer appears in the export`,
      );
    }
  }

  return rows;
}

/**
 * Reads lat/lon together with the precision flag, because the two are one fact:
 * `app.deponija_*` checks that `geo_preciznost = 'nepoznato'` holds exactly when
 * there is no point, so neither may be decided without the other.
 */
function readTacka(
  raw: CsvRow,
  where: string,
  warnings: ImportWarnings,
): { tacka: Tacka | null; geo_preciznost: AppGeoPreciznost } {
  const declared = text(raw['geo_preciznost']);
  let preciznost: AppGeoPreciznost | undefined =
    declared === null ? 'nepoznato' : GEO_PRECIZNOST[declared];

  if (preciznost === undefined) {
    warnings.add(where, `geo_preciznost: unknown value "${declared}", treated as nepoznato`);
    preciznost = 'nepoznato';
  }

  const tacka = readCoordinates(raw, where, warnings);

  if (tacka === null) {
    return { tacka: null, geo_preciznost: 'nepoznato' };
  }

  if (preciznost === 'nepoznato') {
    // A point with an unusable precision flag is still a point. Keeping it while
    // claiming "nepoznato" is what the table constraint forbids, and dropping the
    // coordinate throws away the only location anybody recorded.
    warnings.add(where, 'has coordinates but no usable precision flag, treated as geokodirano');
    preciznost = 'geokodirano';
  }

  return { tacka, geo_preciznost: preciznost };
}

/** lat/lon with the placeholder filtered out, for rows that carry no precision flag. */
function readCoordinates(raw: CsvRow, where: string, warnings: ImportWarnings): Tacka | null {
  const lat = numeric(raw['lat'], where, 'lat', warnings);
  const lon = numeric(raw['lon'], where, 'lon', warnings);

  if (lat === null || lon === null) {
    return null;
  }

  if (isEkoAlertDefault(lat, lon)) {
    warnings.add(where, 'coordinates are the Eko Alert default placeholder, stored as unknown');
    return null;
  }

  return { lat, lon };
}

function isEkoAlertDefault(lat: number, lon: number): boolean {
  return (
    Math.abs(lat - EKO_ALERT_DEFAULT.lat) < COORD_EPSILON &&
    Math.abs(lon - EKO_ALERT_DEFAULT.lon) < COORD_EPSILON
  );
}

/** Da / Ne / blank. Blank is an absent answer, never a "ne". */
function readTrojstvo(
  value: string | undefined,
  where: string,
  warnings: ImportWarnings,
): AppTrojstvo {
  const raw = text(value)?.toLowerCase() ?? null;

  if (raw === null) {
    return 'nepoznato';
  }

  if (raw === 'da' || raw === 'ne' || raw === 'nepoznato') {
    return raw;
  }

  warnings.add(where, `ponovo_se_stvara: unknown value "${raw}", treated as nepoznato`);
  return 'nepoznato';
}

function readPouzdanost(
  value: string | undefined,
  where: string,
  warnings: ImportWarnings,
): AppPouzdanostSpajanja | null {
  const raw = text(value)?.toLowerCase() ?? null;

  if (raw === null) {
    // Blank means the row was never merged with anything, not a weak merge.
    return null;
  }

  if (raw === 'visoka' || raw === 'srednja' || raw === 'niska') {
    return raw;
  }

  warnings.add(where, `spajanje_pouzdanost: unknown value "${raw}", stored as NULL`);
  return null;
}
