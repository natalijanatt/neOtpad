/**
 * Row → model for the settlement layer.
 *
 * Every mapper in the repository is a pure function rather than a provider: it
 * has no dependencies, and a service that maps its own rows is easier to test
 * than one that injects a mapper to do it (`arch-single-responsibility`).
 */
import type { Selectable } from 'kysely';
import { fromPoint } from '../common/geo';
import { toIsoDate, toIsoDateOrNull, toNumberOrNull } from '../common/row-values';
import type { DB } from '../database/generated/schema';
import type {
  MesnaZajednica,
  Naselje,
  NaseljeAlias,
  PlanOdvoza,
  PokrivenostNaselja,
} from './geo.model';

type MesnaZajednicaRow = Selectable<DB['app.mesna_zajednica']>;
type NaseljeRow = Selectable<DB['app.naselje']>;
type PokrivenostRow = Selectable<DB['app.pokrivenost_naselja']>;
type AliasRow = Selectable<DB['app.naselje_alias']>;
type PlanOdvozaRow = Selectable<DB['app.plan_odvoza']>;

export function toMesnaZajednica(row: MesnaZajednicaRow): MesnaZajednica {
  return {
    id: row.id,
    naziv: row.naziv,
    opstina: row.opstina,
  };
}

export function toNaselje(row: NaseljeRow): Naselje {
  const centroid = fromPoint(row.centroid);

  if (centroid === null) {
    // The column is NOT NULL, so this is a query that forgot to select it or a
    // row written around the schema. Either way the caller is about to place a
    // village at 0,0 in the Gulf of Guinea.
    throw new Error(`naselje ${row.id} has no centroid`);
  }

  return {
    id: row.id,
    naziv: row.naziv,
    sifra_mesta: row.sifra_mesta,
    mesna_zajednica_id: row.mesna_zajednica_id,
    opstina: row.opstina,
    centroid,
    broj_domacinstava: row.broj_domacinstava,
    kategorija_naselja: row.kategorija_naselja,
    organizovano_prikupljanje: row.organizovano_prikupljanje,
    pristup_kamionu: row.pristup_kamionu,
    udaljenost_od_baze_km: toNumberOrNull(row.udaljenost_od_baze_km),
  };
}

export function toPokrivenostNaselja(row: PokrivenostRow): PokrivenostNaselja {
  return {
    id: row.id,
    naselje_id: row.naselje_id,
    izvor: row.izvor,
    izvor_url: row.izvor_url,
    godina: row.godina,
    organizovano: row.organizovano,
    odvoz_nedeljno: row.odvoz_nedeljno,
    broj_domacinstava: row.broj_domacinstava,
    broj_stanovnika: row.broj_stanovnika,
    broj_kontejnera_1100l: row.broj_kontejnera_1100l,
    napomena: row.napomena,
  };
}

export function toNaseljeAlias(row: AliasRow): NaseljeAlias {
  return {
    id: row.id,
    naselje_id: row.naselje_id,
    alias: row.alias,
    izvor: row.izvor,
  };
}

export function toPlanOdvoza(row: PlanOdvozaRow): PlanOdvoza {
  return {
    id: row.id,
    naselje_id: row.naselje_id,
    zona: row.zona,
    tip_otpada: row.tip_otpada,
    dan_u_nedelji: row.dan_u_nedelji,
    ciklus_dana: row.ciklus_dana,
    referentni_datum: toIsoDateOrNull(row.referentni_datum),
    izvor: row.izvor,
    izvor_url: row.izvor_url,
    vazi_od: toIsoDate(row.vazi_od),
    vazi_do: toIsoDateOrNull(row.vazi_do),
  };
}
