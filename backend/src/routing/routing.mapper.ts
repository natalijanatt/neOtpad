import type { Selectable } from 'kysely';
import { fromPoint } from '../common/geo';
import {
  toInstant,
  toInstantOrNull,
  toIsoDate,
  toNumber,
  toNumberOrNull,
} from '../common/row-values';
import type { DB } from '../database/generated/schema';
import type {
  CiljFunkcija,
  PlanRute,
  Rastojanje,
  StajalisteRute,
  Vozilo,
} from './routing.model';

type VoziloRow = Selectable<DB['app.vozilo']>;
type PlanRuteRow = Selectable<DB['app.plan_rute']>;
type StajalisteRow = Selectable<DB['app.stajaliste_rute']>;
type RastojanjeRow = Selectable<DB['app.rastojanje']>;

export function toVozilo(row: VoziloRow): Vozilo {
  const depo = fromPoint(row.depo);

  if (depo === null) {
    // NOT NULL in the schema. A vehicle with no depot produces a route that
    // starts nowhere, and every distance on it would be meaningless.
    throw new Error(`vozilo ${row.oznaka} has no depo`);
  }

  return {
    id: row.id,
    oznaka: row.oznaka,
    kapacitet_m3: toNumber(row.kapacitet_m3),
    kapacitet_kg: toNumberOrNull(row.kapacitet_kg),
    potrosnja_l_100km: toNumberOrNull(row.potrosnja_l_100km),
    depo,
    aktivno: row.aktivno,
  };
}

export function toPlanRute(row: PlanRuteRow): PlanRute {
  return {
    id: row.id,
    datum: toIsoDate(row.datum),
    vozilo_id: row.vozilo_id,
    status: row.status,
    generisan_at: toInstant(row.generisan_at),
    algoritam: row.algoritam,
    // Stored verbatim by the planner; narrowed once here rather than at every
    // place that wants to show what the plan was optimised for.
    cilj_funkcija: row.cilj_funkcija as CiljFunkcija,
    ukupna_distanca_m: row.ukupna_distanca_m,
    ukupno_trajanje_min: row.ukupno_trajanje_min,
  };
}

export function toStajalisteRute(row: StajalisteRow): StajalisteRute {
  return {
    id: row.id,
    plan_rute_id: row.plan_rute_id,
    redosled: row.redosled,
    sabirno_mesto_id: row.sabirno_mesto_id,
    kontejner_id: row.kontejner_id,
    prijava_id: row.prijava_id,
    planirani_dolazak: toInstantOrNull(row.planirani_dolazak),
    ocekivano_punjenje: row.ocekivano_punjenje,
    razlog: row.razlog,
    doprinos_ceni: toNumberOrNull(row.doprinos_ceni),
    stvarni_dolazak: toInstantOrNull(row.stvarni_dolazak),
    izvrseno: row.izvrseno,
    potvrda_izvora: row.potvrda_izvora,
  };
}

export function toRastojanje(row: RastojanjeRow): Rastojanje {
  const od_tacka = fromPoint(row.od_tacka);
  const do_tacka = fromPoint(row.do_tacka);

  if (od_tacka === null || do_tacka === null) {
    throw new Error(`rastojanje ${row.id} is missing one of its endpoints`);
  }

  return {
    id: row.id,
    od_tacka,
    do_tacka,
    izvor: row.izvor,
    distanca_m: row.distanca_m,
    trajanje_s: row.trajanje_s,
    izracunato_at: toInstant(row.izracunato_at),
  };
}
