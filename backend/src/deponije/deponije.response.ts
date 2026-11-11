/**
 * Row → response mapping for the dump register. Pure functions, the same split
 * `containers.response.ts` uses.
 */
import { fromPoint } from '../common/geo';
import { toIsoDateOrNull, toNumberOrNull } from '../common/row-values';
import type { DeponijaRedRow } from './deponije.repository';
import type { DumpDto } from './dto/deponije.dto';

export function toDump(row: DeponijaRedRow): DumpDto {
  return {
    id: row.id,
    kanonski_id: row.kanonski_id,
    naziv: row.naziv,
    naselje_id: row.naselje_id,
    naselje_naziv: row.naselje_naziv,
    // No fallback coordinate, ever. The database guarantees the pair, and
    // inventing a centroid for an unknown location is the failure mode
    // `docs/data-sources.md` spends the most words on.
    lokacija: fromPoint(row.tacka),
    geo_preciznost: row.geo_preciznost,
    prvi_put_zabelezena: row.prvi_put_zabelezena,
    poslednji_put_zabelezena: row.poslednji_put_zabelezena,
    godine_evidentirana: row.godine_evidentirana,
    izvori: row.izvori,
    broj_izvornih_redova: row.broj_izvornih_redova,
    broj_opservacija: row.broj_opservacija,
    ponovo_se_stvara: row.ponovo_se_stvara,
    broj_prijava: Number(row.broj_prijava ?? 0),
    poslednja_prijava_at: toIsoDateOrNull(row.poslednja_prijava_at),
    status: row.status,
    // Both computed in SQL, so the field and the `sve=false` predicate that
    // filters on it cannot drift apart.
    stanje: row.stanje,
    aktivna: row.aktivna,
    spajanje_pouzdanost: row.spajanje_pouzdanost,
    povrsina_m2: toNumberOrNull(row.povrsina_m2),
    zapremina_m3: toNumberOrNull(row.zapremina_m3),
    kolicina_t: toNumberOrNull(row.kolicina_t),
    ociscena_datum: toIsoDateOrNull(row.ociscena_datum),
  };
}
