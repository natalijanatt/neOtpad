import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql, type Transaction } from 'kysely';
import { latLon } from '../common/geo';
import { DATABASE, type Database } from '../database/database.module';
import type { AppTipOtpada, AppTrojstvo, DB, Json } from '../database/generated/schema';

type Executor = Kysely<DB> | Transaction<DB>;

/**
 * A `YYYY-MM-DD` string as a `date` operand. Passing a JS Date would send a
 * timestamp and let the session time zone decide which day it falls on.
 */
const asDate = (datum: string) => sql<Date>`${datum}::date`;

export interface SabirnoMestoRow {
  id: string;
  naziv: string;
  naselje_id: string;
  broj_domacinstava: number | null;
  organizovano_prikupljanje: AppTrojstvo;
  lat: number;
  lon: number;
}

export interface KontejnerRow {
  id: string;
  oznaka: string;
  sabirno_mesto_id: string;
  zapremina_l: number;
  tip_otpada: AppTipOtpada;
  fill_percent: number | null;
  aktivni_status: string[] | null;
  tih_od: Date | null;
}

export interface PrognozaRow {
  kontejner_id: string;
  vreme_kriticnog: Date | null;
}

export interface RizikRow {
  subjekat_tip: string;
  subjekat_id: string;
  skor: string;
  klasifikacija: string;
}

export interface PrijavaRow {
  id: string;
  tip: string;
  kontejner_id: string | null;
  naselje_id: string | null;
  lat: number | null;
  lon: number | null;
}

export interface PraznjenjeRow {
  kontejner_id: string;
  poslednje: Date;
}

export interface PlanOdvozaRow {
  naselje_id: string;
  tip_otpada: AppTipOtpada;
  dan_u_nedelji: number;
  ciklus_dana: number;
  referentni_datum: Date | null;
}

export interface VoziloRow {
  id: string;
  oznaka: string;
  kapacitet_m3: string;
  lat: number;
  lon: number;
}

/** Everything the priority function reads, fetched in one round each. */
export interface CandidateSources {
  sabirnaMesta: SabirnoMestoRow[];
  kontejneri: KontejnerRow[];
  prognoze: PrognozaRow[];
  rizici: RizikRow[];
  prijave: PrijavaRow[];
  senzori: Set<string>;
  praznjenja: PraznjenjeRow[];
  rasporedi: PlanOdvozaRow[];
}

export interface NewStop {
  redosled: number;
  sabirno_mesto_id: string;
  prijava_id: string | null;
  planirani_dolazak: Date;
  ocekivano_punjenje: number;
  razlog: string;
  doprinos_ceni: number;
  prioritet: number;
  komponente: Json;
}

export interface NewPlan {
  datum: string;
  vozilo_id: string;
  /**
   * One JS `Date`, shared by every plan a single `generate()` call writes —
   * never `default now()` per row. That is what makes a "generation" a
   * well-defined, queryable thing: without it, a vehicle that got zero stops
   * this run keeps showing its plan from an earlier run next to a sibling
   * vehicle's brand-new one, stitching two different routing decisions
   * together as if they were made at the same time.
   */
  generisan_at: Date;
  algoritam: string;
  cilj_funkcija: Json;
  ukupna_distanca_m: number;
  ukupno_trajanje_min: number;
  stajalista: NewStop[];
}

export interface PlanRow {
  id: string;
  datum: string;
  vozilo_id: string;
  vozilo_oznaka: string;
  status: string;
  generisan_at: Date;
  algoritam: string;
  cilj_funkcija: Json;
  ukupna_distanca_m: number | null;
  ukupno_trajanje_min: number | null;
  depo_lat: number;
  depo_lon: number;
}

export interface StopRow {
  plan_rute_id: string;
  redosled: number;
  sabirno_mesto_id: string | null;
  prijava_id: string | null;
  planirani_dolazak: Date | null;
  ocekivano_punjenje: number | null;
  razlog: string;
  doprinos_ceni: string | null;
  prioritet: string | null;
  komponente: Json | null;
  naziv: string | null;
  naselje_id: string | null;
  lat: number | null;
  lon: number | null;
}

@Injectable()
export class RoutingRepository {
  constructor(@Inject(DATABASE) private readonly db: Executor) {}

  async withTransaction<T>(work: (repo: RoutingRepository) => Promise<T>): Promise<T> {
    return (this.db as Database).transaction().execute((trx) => work(new RoutingRepository(trx)));
  }

  /**
   * One query per source rather than one wide join: the sources have different
   * grains (point, container, settlement, report) and a join across them
   * multiplies rows until the "latest forecast per container" is no longer
   * expressible. The service does the fan-in in memory; the tables are small.
   */
  async loadCandidateSources(datum: string): Promise<CandidateSources> {
    const [sabirnaMesta, kontejneri, prognoze, rizici, prijave, montaze, praznjenja, rasporedi] = await Promise.all([
      this.db
        .selectFrom('app.sabirno_mesto as sm')
        .innerJoin('app.naselje as n', 'n.id', 'sm.naselje_id')
        .select([
          'sm.id',
          'sm.naziv',
          'sm.naselje_id',
          'sm.broj_domacinstava',
          'n.organizovano_prikupljanje',
          ...latLon('sm.lokacija'),
        ])
        .where('sm.aktivno_od', '<=', asDate(datum))
        .where((eb) => eb.or([eb('sm.aktivno_do', 'is', null), eb('sm.aktivno_do', '>=', asDate(datum))]))
        .execute(),

      this.db
        .selectFrom('app.kontejner as k')
        .leftJoin('app.kontejner_stanje as ks', 'ks.kontejner_id', 'k.id')
        .select([
          'k.id',
          'k.oznaka',
          'k.sabirno_mesto_id',
          'k.zapremina_l',
          'k.tip_otpada',
          'ks.fill_percent',
          'ks.aktivni_status',
          'ks.tih_od',
        ])
        .where('k.status', '=', 'aktivan')
        .where('k.uklonjen_datum', 'is', null)
        .execute(),

      this.db
        .selectFrom('app.prognoza_punjenja')
        .distinctOn('kontejner_id')
        .select(['kontejner_id', 'vreme_kriticnog'])
        .orderBy('kontejner_id')
        .orderBy('izracunata_at', 'desc')
        .execute(),

      this.db
        .selectFrom('app.rizik')
        .distinctOn(['subjekat_tip', 'subjekat_id'])
        .select(['subjekat_tip', 'subjekat_id', 'skor', 'klasifikacija'])
        .where('subjekat_tip', 'in', ['sabirno_mesto', 'naselje'])
        .orderBy('subjekat_tip')
        .orderBy('subjekat_id')
        .orderBy('izracunato_at', 'desc')
        .execute(),

      // Container-shaped problems only. A reported illegal dump needs a crew
      // and machinery, not the next collection truck (CLAUDE.md, reports).
      this.db
        .selectFrom('app.prijava as p')
        .select(['p.id', 'p.tip', 'p.kontejner_id', 'p.naselje_id', ...latLon('p.tacka')])
        .where('p.potvrdjena_at', 'is not', null)
        .where('p.resena_at', 'is', null)
        .where('p.tip', 'in', ['pun_kontejner', 'prelivanje', 'ostecen_kontejner', 'nedostaje_kontejner'])
        .execute(),

      this.db.selectFrom('app.uredjaj_montaza').select('kontejner_id').where('montiran_do', 'is', null).execute(),

      this.db
        .selectFrom('app.praznjenje')
        .select(['kontejner_id', (eb) => eb.fn.max('detektovano_at').as('poslednje')])
        .groupBy('kontejner_id')
        .execute(),

      this.db
        .selectFrom('app.plan_odvoza')
        .select(['naselje_id', 'tip_otpada', 'dan_u_nedelji', 'ciklus_dana', 'referentni_datum'])
        .where('vazi_od', '<=', asDate(datum))
        .where((eb) => eb.or([eb('vazi_do', 'is', null), eb('vazi_do', '>=', asDate(datum))]))
        .execute(),
    ]);

    return {
      sabirnaMesta,
      kontejneri: kontejneri.map((k) => ({ ...k, aktivni_status: k.aktivni_status ?? null })),
      prognoze,
      rizici,
      prijave,
      senzori: new Set(montaze.map((m) => m.kontejner_id)),
      praznjenja: praznjenja.filter((p): p is PraznjenjeRow => p.poslednje !== null),
      rasporedi,
    };
  }

  async loadActiveVehicles(): Promise<VoziloRow[]> {
    return this.db
      .selectFrom('app.vozilo as v')
      .select(['v.id', 'v.oznaka', 'v.kapacitet_m3', ...latLon('v.depo')])
      .where('v.aktivno', '=', true)
      .orderBy('v.oznaka')
      .execute();
  }

  /** Returns the new plan ids in the order given. Call inside `withTransaction`. */
  async insertPlans(plans: readonly NewPlan[]): Promise<string[]> {
    const ids: string[] = [];
    for (const plan of plans) {
      const { id } = await this.db
        .insertInto('app.plan_rute')
        .values({
          datum: plan.datum,
          vozilo_id: plan.vozilo_id,
          generisan_at: plan.generisan_at,
          algoritam: plan.algoritam,
          cilj_funkcija: sql`${JSON.stringify(plan.cilj_funkcija)}::jsonb`,
          ukupna_distanca_m: plan.ukupna_distanca_m,
          ukupno_trajanje_min: plan.ukupno_trajanje_min,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      if (plan.stajalista.length > 0) {
        await this.db
          .insertInto('app.stajaliste_rute')
          .values(
            plan.stajalista.map((s) => ({
              plan_rute_id: id,
              redosled: s.redosled,
              sabirno_mesto_id: s.sabirno_mesto_id,
              prijava_id: s.prijava_id,
              planirani_dolazak: s.planirani_dolazak,
              ocekivano_punjenje: s.ocekivano_punjenje,
              razlog: s.razlog,
              doprinos_ceni: s.doprinos_ceni,
              prioritet: s.prioritet,
              komponente: sql`${JSON.stringify(s.komponente)}::jsonb`,
            })),
          )
          .execute();
      }
      ids.push(id);
    }
    return ids;
  }

  /**
   * The single most recent `generisan_at` for the day, across every vehicle —
   * "today's plan" as a well-defined thing rather than each vehicle's own
   * newest row, which can come from different, unrelated generation runs.
   * `null` when nothing has been generated for that day yet.
   */
  async findLatestGeneration(datum: string): Promise<Date | null> {
    const row = await this.db
      .selectFrom('app.plan_rute')
      .select((eb) => eb.fn.max('generisan_at').as('generisan_at'))
      .where('datum', '=', asDate(datum))
      .executeTakeFirst();
    return row?.generisan_at ?? null;
  }

  async findPlans(filter: {
    ids?: readonly string[];
    datum?: string;
    status?: string;
    generisanAt?: Date;
  }): Promise<PlanRow[]> {
    let query = this.db
      .selectFrom('app.plan_rute as pr')
      .innerJoin('app.vozilo as v', 'v.id', 'pr.vozilo_id')
      .select([
        'pr.id',
        // As text: `pg` turns a `date` into a JS Date at local midnight, and
        // formatting that back is where an off-by-one day creeps in.
        sql<string>`pr.datum::text`.as('datum'),
        'pr.vozilo_id',
        'v.oznaka as vozilo_oznaka',
        'pr.status',
        'pr.generisan_at',
        'pr.algoritam',
        'pr.cilj_funkcija',
        'pr.ukupna_distanca_m',
        'pr.ukupno_trajanje_min',
        sql<number>`extensions.st_y(v.depo::extensions.geometry)`.as('depo_lat'),
        sql<number>`extensions.st_x(v.depo::extensions.geometry)`.as('depo_lon'),
      ])
      .orderBy('pr.generisan_at', 'desc')
      .orderBy('v.oznaka');

    if (filter.ids !== undefined) {
      if (filter.ids.length === 0) return [];
      query = query.where('pr.id', 'in', filter.ids);
    }
    if (filter.generisanAt !== undefined) {
      query = query.where('pr.generisan_at', '=', filter.generisanAt);
    }
    if (filter.datum !== undefined) query = query.where('pr.datum', '=', asDate(filter.datum));
    if (filter.status !== undefined) query = query.where('pr.status', '=', filter.status);

    return query.execute();
  }

  async findStops(planIds: readonly string[]): Promise<StopRow[]> {
    if (planIds.length === 0) return [];

    return this.db
      .selectFrom('app.stajaliste_rute as s')
      .leftJoin('app.sabirno_mesto as sm', 'sm.id', 's.sabirno_mesto_id')
      .select([
        's.plan_rute_id',
        's.redosled',
        's.sabirno_mesto_id',
        's.prijava_id',
        's.planirani_dolazak',
        's.ocekivano_punjenje',
        's.razlog',
        's.doprinos_ceni',
        's.prioritet',
        's.komponente',
        'sm.naziv',
        'sm.naselje_id',
        ...latLon('sm.lokacija'),
      ])
      .where('s.plan_rute_id', 'in', planIds)
      .orderBy('s.plan_rute_id')
      .orderBy('s.redosled')
      .execute();
  }
}
