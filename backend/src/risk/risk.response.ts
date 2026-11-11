/**
 * Row → response mapping for the black-spot list. Pure functions, the same split
 * `containers.response.ts` uses: the repository decides what to load, this file
 * decides what a black spot looks like on the wire.
 */
import { fromPoint, type Tacka } from '../common/geo';
import { toNumber } from '../common/row-values';
import { toCrnaTacka } from './risk.mapper';
import type { CrnaTackaRedRow } from './risk.repository';
import type { BlackSpotDto, BlackSpotRizikDto } from './dto/risk.dto';

/**
 * Where to draw the spot, and how much the coordinate may be trusted.
 *
 * The canonical dump is preferred because it is the only one of the two that
 * carries a stated precision; `crna_tacka.tacka` has none, so a point that comes
 * from there is reported as `geokodirano` — the bucket the import already uses
 * for derived coordinates, including ones taken from a citizen report
 * (`docs/data-sources.md`). Claiming a surveyed point here would put a village
 * centroid on the map as if someone had stood on it.
 */
function polozaj(row: CrnaTackaRedRow, sopstvena: Tacka | null): { lokacija: Tacka | null; geo_preciznost: string } {
  const kanonska = fromPoint(row.kanonska_tacka);
  if (kanonska !== null) return { lokacija: kanonska, geo_preciznost: row.kanonska_geo_preciznost ?? 'nepoznato' };
  if (sopstvena !== null) return { lokacija: sopstvena, geo_preciznost: 'geokodirano' };

  return { lokacija: null, geo_preciznost: 'nepoznato' };
}

function rizikOf(row: CrnaTackaRedRow): BlackSpotRizikDto | null {
  if (row.rizik_skor === null || row.rizik_izracunato_at === null) return null;

  return {
    skor: toNumber(row.rizik_skor),
    klasifikacija: row.rizik_klasifikacija ?? 'nizak',
    // `jsonb` is only as typed as whatever wrote it; the narrowing is stated
    // here, once, rather than as a cast at every call site.
    komponente: (row.rizik_komponente ?? {}) as Record<string, number>,
    izracunato_at: row.rizik_izracunato_at.toISOString(),
    subjekat_tip: row.rizik_subjekat_tip ?? 'naselje',
  };
}

export function toBlackSpot(row: CrnaTackaRedRow): BlackSpotDto {
  const crna = toCrnaTacka(row);
  const { lokacija, geo_preciznost } = polozaj(row, crna.tacka);

  return {
    id: crna.id,
    naselje_id: crna.naselje_id,
    naselje_naziv: row.naselje_naziv,
    kanonska_id: crna.kanonska_id,
    lokacija,
    geo_preciznost,
    prvi_put: crna.prvi_put,
    poslednji_put: crna.poslednji_put,
    broj_ponavljanja: crna.broj_ponavljanja,
    preporuka: crna.preporuka,
    obrazlozenje: crna.obrazlozenje,
    status: crna.status,
    sprovedeno_at: crna.sprovedeno_at === null ? null : crna.sprovedeno_at.toISOString(),
    rizik: rizikOf(row),
  };
}
