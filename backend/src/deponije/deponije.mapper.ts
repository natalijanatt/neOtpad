import type { Selectable } from 'kysely';
import { fromPoint } from '../common/geo';
import { toIsoDateOrNull, toNumberOrNull } from '../common/row-values';
import type { DB } from '../database/generated/schema';
import type {
  DeponijaKanonska,
  DeponijaLokacija,
  DeponijaOpservacija,
  IzvornaSerija,
} from './deponije.model';

type KanonskaRow = Selectable<DB['app.deponija_kanonska']>;
type LokacijaRow = Selectable<DB['app.deponija_lokacija']>;
type OpservacijaRow = Selectable<DB['app.deponija_opservacija']>;
type SerijaRow = Selectable<DB['app.izvorna_serija']>;

export function toDeponijaKanonska(row: KanonskaRow): DeponijaKanonska {
  return {
    id: row.id,
    kanonski_id: row.kanonski_id,
    naziv: row.naziv,
    naselje_id: row.naselje_id,
    // No fallback coordinate here, ever. The database guarantees the pair, and
    // inventing a centroid for an unknown location is the failure mode
    // `docs/data-sources.md` spends the most words on.
    tacka: fromPoint(row.tacka),
    geo_preciznost: row.geo_preciznost,
    prvi_put_zabelezena: row.prvi_put_zabelezena,
    poslednji_put_zabelezena: row.poslednji_put_zabelezena,
    godine_evidentirana: row.godine_evidentirana,
    izvori: row.izvori,
    broj_izvornih_redova: row.broj_izvornih_redova,
    broj_opservacija: row.broj_opservacija,
    ponovo_se_stvara: row.ponovo_se_stvara,
    status: row.status,
    spajanje_pouzdanost: row.spajanje_pouzdanost,
  };
}

export function toDeponijaLokacija(row: LokacijaRow): DeponijaLokacija {
  return {
    id: row.id,
    location_id: row.location_id,
    kanonska_id: row.kanonska_id,
    naziv: row.naziv,
    naselje_id: row.naselje_id,
    tacka: fromPoint(row.tacka),
    geo_preciznost: row.geo_preciznost,
    katastarska_parcela: row.katastarska_parcela,
    katastarska_opstina: row.katastarska_opstina,
    prvi_put_zabelezena: row.prvi_put_zabelezena,
    poslednji_put_zabelezena: row.poslednji_put_zabelezena,
    godine_evidentirana: row.godine_evidentirana,
    tip_otpada_opis: row.tip_otpada_opis,
    povrsina_m2: toNumberOrNull(row.povrsina_m2),
    zapremina_m3: toNumberOrNull(row.zapremina_m3),
    kolicina_t: toNumberOrNull(row.kolicina_t),
    ciscenja_godisnje: row.ciscenja_godisnje,
    ociscena_datum: toIsoDateOrNull(row.ociscena_datum),
    ponovo_se_stvara: row.ponovo_se_stvara,
    status: row.status,
    izvor: row.izvor,
    izvor_url: row.izvor_url,
    napomena: row.napomena,
    spajanje_pouzdanost: row.spajanje_pouzdanost,
    spajanje_razlog: row.spajanje_razlog,
  };
}

export function toDeponijaOpservacija(row: OpservacijaRow): DeponijaOpservacija {
  return {
    id: row.id,
    lokacija_id: row.lokacija_id,
    kanonska_id: row.kanonska_id,
    datum: toIsoDateOrNull(row.datum),
    godina: row.godina,
    tip_dogadjaja: row.tip_dogadjaja,
    tacka: fromPoint(row.tacka),
    povrsina_m2: toNumberOrNull(row.povrsina_m2),
    zapremina_m3: toNumberOrNull(row.zapremina_m3),
    kolicina_t: toNumberOrNull(row.kolicina_t),
    broj_deponija: row.broj_deponija,
    izvor: row.izvor,
    izvor_url: row.izvor_url,
    opis: row.opis,
  };
}

export function toIzvornaSerija(row: SerijaRow): IzvornaSerija {
  return {
    id: row.id,
    izvor: row.izvor,
    godina_od: row.godina_od,
    godina_do: row.godina_do,
    grupa_uporedivosti: row.grupa_uporedivosti,
    napomena: row.napomena,
  };
}
