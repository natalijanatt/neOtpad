import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { latLon } from '../common/geo';
import { DATABASE, type Database } from '../database/database.module';
import type { AppTipOtpada, Json } from '../database/generated/schema';
import type { ContainerQueryDto, ContainerReadingsQueryDto } from './dto/containers.dto';

export interface KontejnerRedRow {
  id: string;
  oznaka: string;
  tip_otpada: AppTipOtpada;
  zapremina_l: number;
  sabirno_mesto_id: string;
  mesto_naziv: string;
  naselje_id: string;
  lat: number;
  lon: number;
  ima_senzor: boolean;
  fill_percent: number | null;
  measured_at: Date | null;
  trend_pp_po_danu: string | null;
  baterija_percent: number | null;
  aktivni_status: string[] | null;
  tih_od: Date | null;
  poslednje_praznjenje: Date | null;
  prelivanja_90d: string | number;
  prognoza_izracunata_at: Date | null;
  prognoza_ulazni_podaci_do: Date | null;
  prognoza_vreme_kriticnog: Date | null;
  prognoza_pouzdanost: string | null;
  prognoza_ima_rupu: boolean | null;
  prognoza_serija: Json | null;
}

export interface OcitavanjeRedRow {
  measured_at: Date;
  fill_percent_izracunat: number | null;
  pouzdano: boolean | null;
  orientation: string | null;
  battery_percent: number | null;
}

@Injectable()
export class ContainersRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Everything the fleet views need about a container: where it stands, how full
   * it is, when it was last emptied, and what the newest forecast says.
   *
   * One query shape for the list and for a single container, so the two can
   * never disagree about what a container looks like. The per-row subqueries
   * evaluate only for the rows a page actually returns.
   *
   * `prognoza_punjenja` is read by joining it, not by importing the forecasting
   * module: containers sits upstream of forecasting in the module map, and the
   * rule `routing.repository.ts` already follows applies — repositories join
   * across tables, modules do not import each other.
   */
  private osnovniUpit() {
    return this.db
      .selectFrom('app.kontejner as k')
      .innerJoin('app.sabirno_mesto as sm', 'sm.id', 'k.sabirno_mesto_id')
      .leftJoin('app.kontejner_stanje as ks', 'ks.kontejner_id', 'k.id')
      .leftJoinLateral(
        (eb) =>
          eb
            .selectFrom('app.prognoza_punjenja as p')
            .select([
              'p.izracunata_at',
              'p.ulazni_podaci_do',
              'p.vreme_kriticnog',
              'p.pouzdanost',
              'p.ima_rupu',
              'p.serija',
            ])
            .whereRef('p.kontejner_id', '=', 'k.id')
            .orderBy('p.izracunata_at', 'desc')
            .limit(1)
            .as('pr'),
        (join) => join.onTrue(),
      )
      .select((eb) => [
        'k.id',
        'k.oznaka',
        'k.tip_otpada',
        'k.zapremina_l',
        'sm.id as sabirno_mesto_id',
        'sm.naziv as mesto_naziv',
        'sm.naselje_id',
        ...latLon('sm.lokacija'),
        'ks.fill_percent',
        'ks.measured_at',
        'ks.trend_pp_po_danu',
        'ks.baterija_percent',
        'ks.aktivni_status',
        'ks.tih_od',
        'pr.izracunata_at as prognoza_izracunata_at',
        'pr.ulazni_podaci_do as prognoza_ulazni_podaci_do',
        'pr.vreme_kriticnog as prognoza_vreme_kriticnog',
        'pr.pouzdanost as prognoza_pouzdanost',
        'pr.ima_rupu as prognoza_ima_rupu',
        'pr.serija as prognoza_serija',
        eb
          .exists(
            eb
              .selectFrom('app.uredjaj_montaza as m')
              .select('m.id')
              .whereRef('m.kontejner_id', '=', 'k.id')
              .where('m.montiran_do', 'is', null),
          )
          .as('ima_senzor'),
        eb
          .selectFrom('app.praznjenje as pz')
          .select((inner) => inner.fn.max('pz.detektovano_at').as('v'))
          .whereRef('pz.kontejner_id', '=', 'k.id')
          .as('poslednje_praznjenje'),
        // Overflow history, not forecast: a container that overflows every month
        // is a placement problem rather than a scheduling one, and the map is
        // where that becomes visible.
        eb
          .selectFrom('app.alarm as a')
          .select((inner) => inner.fn.countAll().as('v'))
          .whereRef('a.kontejner_id', '=', 'k.id')
          .where('a.tip', '=', 'prelivanje')
          .where('a.nastao_at', '>=', sql<Date>`now() - interval '90 days'`)
          .as('prelivanja_90d'),
      ]);
  }

  async page(input: ContainerQueryDto): Promise<KontejnerRedRow[]> {
    let query = this.osnovniUpit()
      .where('k.status', '=', 'aktivan')
      .where('k.uklonjen_datum', 'is', null)
      .where('sm.aktivno_od', '<=', sql<Date>`current_date`)
      .where((eb) => eb.or([eb('sm.aktivno_do', 'is', null), eb('sm.aktivno_do', '>', sql<Date>`current_date`)]));

    if (input.naselje_id) query = query.where('sm.naselje_id', '=', input.naselje_id);
    if (input.search) query = query.where('k.oznaka', 'ilike', `%${input.search}%`);
    if (input.min_fill !== undefined) query = query.where('ks.fill_percent', '>=', input.min_fill);
    // A container with no forecast has a NULL here, so it drops out of the
    // filter on its own — which is the right answer: nothing says it is critical.
    if (input.kriticno_do) query = query.where('pr.vreme_kriticnog', '<=', new Date(input.kriticno_do));
    if (input.samo_sa_senzorom) {
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('app.uredjaj_montaza as m2')
            .select('m2.id')
            .whereRef('m2.kontejner_id', '=', 'k.id')
            .where('m2.montiran_do', 'is', null),
        ),
      );
    }

    return query
      .orderBy('k.oznaka')
      .orderBy('k.id')
      .offset((input.page - 1) * input.limit)
      // One more than asked for: that extra row is the whole of `hasMore`.
      .limit(input.limit + 1)
      .execute() as Promise<KontejnerRedRow[]>;
  }

  /** One container, including a removed one: the detail page still has to render it. */
  async byId(id: string): Promise<KontejnerRedRow | undefined> {
    const rows = (await this.osnovniUpit().where('k.id', '=', id).execute()) as KontejnerRedRow[];

    return rows[0];
  }

  /**
   * The measured history behind the chart. Unreliable readings come back rather
   * than being filtered out: the UI greys them, because hiding them would turn a
   * device fault into a gap nobody can see.
   */
  async ocitavanja(kontejnerId: string, input: ContainerReadingsQueryDto): Promise<OcitavanjeRedRow[]> {
    const rows = await this.db
      .selectFrom('app.ocitavanje')
      .select(['measured_at', 'fill_percent_izracunat', 'pouzdano', 'orientation', 'battery_percent'])
      .where('kontejner_id', '=', kontejnerId)
      .where('measured_at', '>=', sql<Date>`now() - make_interval(days => ${input.dana})`)
      .orderBy('measured_at')
      .limit(input.limit)
      .execute();

    return rows as OcitavanjeRedRow[];
  }
}
