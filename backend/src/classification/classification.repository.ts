/**
 * Everything the classifier reads and writes.
 *
 * It reads `app.prijava`, `app.kontejner` and the risk tables directly instead
 * of importing the modules that own them - the same rule
 * `containers.repository.ts` already follows for `prognoza_punjenja`:
 * repositories join across tables, modules do not import each other. That keeps
 * this module a leaf: nothing here calls back into reports, so the enqueue side
 * (in the report's own transaction) and the worker side cannot deadlock through
 * a cycle of services.
 */
import { Inject, Injectable } from '@nestjs/common';
import { sql, type Selectable } from 'kysely';
import { DATABASE, type Database } from '../database/database.module';
import type { AppPodkategorijaPrijave, AppTipPrijave, AppVelicinaProblema, DB, Json } from '../database/generated/schema';
import { toPoint, type Tacka } from '../common/geo';
import { pouzdanoOcitavanje } from '../common/readings';
import type { KandidatDuplikat, KandidatKontejner } from './classifier.port';

export type KlasifikacijaRed = Selectable<DB['app.prijava_klasifikacija']>;

export interface PreuzetRed {
  id: string;
  prijava_id: string;
  prijava_verzija: number;
  pokusaj: number;
}

export interface RezultatUpis {
  izvor: 'pravila' | 'model';
  model: string;
  predlozeni_tip: AppTipPrijave;
  predlozena_podkategorija: AppPodkategorijaPrijave;
  predlozena_velicina: AppVelicinaProblema | null;
  predlozeni_tip_obrade: string;
  predlozeni_prioritet: number;
  predlozeni_kontejner_id: string | null;
  predlozeni_duplikat_od: string | null;
  pouzdanost: number;
  obrazlozenje: string;
  signali: Json;
  greska: string | null;
}

/**
 * How far from a report's coordinates a container may still be the one the
 * citizen meant. 60 m is a collection point and its immediate surroundings; past
 * that, "the container over there" is a different container.
 */
const RADIJUS_KONTEJNERA_M = 60;

/** Black spots and registry dumps are area features; 200 m is "at this spot" for them. */
const RADIJUS_RIZIKA_M = 200;

/** A report 300 m and two days away is a plausible repeat of the same problem. */
const RADIJUS_DUPLIKATA_M = 300;
const SATI_DUPLIKATA = 72;

/** What `signali` holds before anything has been computed for the row. */
const PRAZNI_SIGNALI = sql<Json>`'{}'::jsonb`;

@Injectable()
export class ClassificationRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Takes the oldest pending rows and counts the attempt against them.
   *
   * `for update skip locked` so a second API instance picks different rows
   * rather than waiting, and the attempt is counted on claim rather than on
   * failure: a process that dies mid-call must still burn a retry, or one
   * poisonous report loops forever at the head of the queue.
   */
  async preuzmi(limit: number): Promise<PreuzetRed[]> {
    const rezultat = await sql<PreuzetRed>`
      update app.prijava_klasifikacija as k
         set pokusaj = k.pokusaj + 1
       where k.id in (
         select id from app.prijava_klasifikacija
          where status = 'na_cekanju'
          order by kreirana_at, id
          for update skip locked
          limit ${limit}
       )
      returning k.id, k.prijava_id, k.prijava_verzija, k.pokusaj
    `.execute(this.db);
    return rezultat.rows;
  }

  /**
   * Queues a report for classification, replacing any earlier proposal for this
   * version.
   *
   * Every proposal column is cleared, not only the ones the next run is certain
   * to overwrite: a row left holding half of a previous answer is a row whose
   * `predlozeni_tip` belongs to one run and whose `status` belongs to another.
   */
  async postaviURed(prijavaId: string, verzija: number): Promise<string> {
    const red = await this.db
      .insertInto('app.prijava_klasifikacija')
      .values({ prijava_id: prijavaId, prijava_verzija: verzija, status: 'na_cekanju' })
      .onConflict((conflict) =>
        conflict.columns(['prijava_id', 'prijava_verzija']).doUpdateSet({
          status: 'na_cekanju', pokusaj: 0, greska: null, obradjena_at: null,
          izvor: null, model: null, pouzdanost: null, obrazlozenje: null,
          predlozeni_tip: null, predlozena_podkategorija: null, predlozena_velicina: null,
          predlozeni_tip_obrade: null, predlozeni_prioritet: null,
          predlozeni_kontejner_id: null, predlozeni_duplikat_od: null,
          signali: PRAZNI_SIGNALI, ishod: null,
        }),
      )
      .returning('id')
      .executeTakeFirstOrThrow();
    return red.id;
  }

  /**
   * Claims one known row, the same way `preuzmi` claims a batch.
   *
   * The on-demand endpoint used to skip this and process the row it had just
   * queued, which let the 15-second worker claim the same row and call the
   * model a second time. Returns false when the worker got there first; the
   * caller then reads what that sweep wrote instead of racing it.
   */
  async preuzmiJedan(id: string): Promise<boolean> {
    const red = await this.db.updateTable('app.prijava_klasifikacija')
      .set({ pokusaj: sql<number>`pokusaj + 1` })
      .where('id', '=', id).where('status', '=', 'na_cekanju')
      .returning('id').executeTakeFirst();
    return red !== undefined;
  }

  prijava(id: string) {
    return this.db.selectFrom('app.prijava').selectAll().where('id', '=', id).executeTakeFirst();
  }

  fotografije(prijavaId: string) {
    return this.db.selectFrom('app.prijava_foto').select(['javni_url', 'mime_tip'])
      .where('prijava_id', '=', prijavaId).orderBy('otpremljena_at', 'asc').execute();
  }

  naselje(id: string) {
    return this.db.selectFrom('app.naselje').select(['naziv', 'organizovano_prikupljanje'])
      .where('id', '=', id).executeTakeFirst();
  }

  async upisiRezultat(id: string, rezultat: RezultatUpis): Promise<void> {
    await this.db.updateTable('app.prijava_klasifikacija')
      .set({ ...rezultat, status: 'uspesna', obradjena_at: sql<Date>`clock_timestamp()` })
      .where('id', '=', id).execute();
  }

  async upisiGresku(id: string, greska: string, konacna: boolean): Promise<void> {
    await this.db.updateTable('app.prijava_klasifikacija')
      .set({
        greska: greska.slice(0, 2000),
        // A non-final failure stays pending so the next sweep retries it; the
        // attempt counter, not the status, is what ends the loop.
        ...(konacna ? { status: 'neuspesna' as const, obradjena_at: sql<Date>`clock_timestamp()` } : {}),
      })
      .where('id', '=', id).execute();
  }

  /** The report moved on; a proposal computed against an older version is noise. */
  async oznaciZastarele(prijavaId: string, verzija: number): Promise<void> {
    await this.db.updateTable('app.prijava_klasifikacija')
      .set({ status: 'zastarela', obradjena_at: sql<Date>`clock_timestamp()` })
      .where('prijava_id', '=', prijavaId).where('prijava_verzija', '<', verzija)
      .where('status', '=', 'na_cekanju').execute();
  }

  /** The newest proposal for each report, for the dispatcher queue and detail view. */
  zaPrijave(prijavaIds: string[]) {
    if (prijavaIds.length === 0) return Promise.resolve([]);
    return this.db.selectFrom('app.prijava_klasifikacija').selectAll()
      .where('prijava_id', 'in', prijavaIds)
      .orderBy('prijava_id').orderBy('prijava_verzija', 'desc').execute();
  }

  /**
   * Containers the report might be about.
   *
   * Three ways in, in descending order of how much the answer is worth: the
   * container the report names, the containers standing near its coordinates,
   * and - for a settlement-only SMS with no point at all - the containers in
   * that settlement. The last one is a list to choose from, not a location, so
   * its distances are null and nothing downstream may read them as metres.
   */
  async kandidatiKontejneri(kontejnerId: string | null, tacka: Tacka | null, naseljeId: string | null): Promise<KandidatKontejner[]> {
    const tackaSql = toPoint(tacka);
    const rastojanje = tackaSql === null
      ? sql<number | null>`null::int`
      : sql<number | null>`round(extensions.st_distance(sm.lokacija, ${tackaSql}))::int`;

    let upit = this.db
      .selectFrom('app.kontejner as k')
      .innerJoin('app.sabirno_mesto as sm', 'sm.id', 'k.sabirno_mesto_id')
      .leftJoin('app.kontejner_stanje as ks', 'ks.kontejner_id', 'k.id')
      .select([
        'k.id', 'k.oznaka', 'k.tip_otpada', 'sm.naziv as mesto',
        'ks.fill_percent', 'ks.aktivni_status', 'ks.tih_od',
        rastojanje.as('rastojanje_m'),
        (eb) => eb.selectFrom('app.praznjenje as p')
          .select(sql<number | null>`round(extract(epoch from now() - max(p.detektovano_at)) / 86400)::int`.as('dana'))
          .whereRef('p.kontejner_id', '=', 'k.id').as('dana_od_praznjenja'),
      ])
      .where('k.status', '=', 'aktivan')
      .where('k.uklonjen_datum', 'is', null)
      .where('sm.aktivno_od', '<=', sql<Date>`current_date`)
      .where((eb) => eb.or([eb('sm.aktivno_do', 'is', null), eb('sm.aktivno_do', '>', sql<Date>`current_date`)]))
      .limit(8);

    if (kontejnerId) {
      // Everything standing at the same collection point, not just the named
      // bin: a citizen reporting "the container by the school" may well mean the
      // glass one beside the one they tapped.
      upit = upit.where((eb) => eb.or([
        eb('k.id', '=', kontejnerId),
        eb('k.sabirno_mesto_id', 'in', eb.selectFrom('app.kontejner').select('sabirno_mesto_id').where('id', '=', kontejnerId)),
      ]));
    } else if (tackaSql !== null) {
      upit = upit.where(sql<boolean>`extensions.st_dwithin(sm.lokacija, ${tackaSql}, ${RADIJUS_KONTEJNERA_M})`);
    } else if (naseljeId) {
      upit = upit.where('sm.naselje_id', '=', naseljeId);
    } else {
      return [];
    }

    const redovi = await upit.orderBy(sql`rastojanje_m nulls last`).orderBy('k.oznaka').execute();

    return redovi.map((red) => ({
      id: red.id,
      oznaka: red.oznaka,
      tip_otpada: red.tip_otpada,
      mesto: red.mesto,
      rastojanje_m: red.rastojanje_m,
      // Reliability is applied here rather than in the prompt: an unreliable
      // number is not a smaller number, it is the absence of one.
      punjenje_percent: pouzdanoOcitavanje(red.aktivni_status, red.tih_od) ? red.fill_percent : null,
      dana_od_praznjenja: red.dana_od_praznjenja,
    }));
  }

  /** Metres to the nearest black spot, or null when there is none within reach. */
  async rastojanjeDoCrneTacke(tacka: Tacka | null): Promise<number | null> {
    const tackaSql = toPoint(tacka);
    if (tackaSql === null) return null;
    const red = await this.db.selectFrom('app.crna_tacka')
      .select(sql<number>`round(extensions.st_distance(tacka, ${tackaSql}))::int`.as('m'))
      .where('tacka', 'is not', null)
      .where(sql<boolean>`extensions.st_dwithin(tacka, ${tackaSql}, ${RADIJUS_RIZIKA_M})`)
      .orderBy('m').limit(1).executeTakeFirst();
    return red?.m ?? null;
  }

  /**
   * Metres to the nearest dump in the historical registry.
   *
   * `geo_preciznost` is filtered on purpose: a `centroid_naselja` row is a
   * settlement centre wearing a coordinate, and measuring distance to it would
   * report "40 m from a known dump" for a report that happens to sit near the
   * middle of its village (`docs/data-sources.md`).
   */
  async rastojanjeDoDeponije(tacka: Tacka | null): Promise<number | null> {
    const tackaSql = toPoint(tacka);
    if (tackaSql === null) return null;
    const red = await this.db.selectFrom('app.deponija_kanonska')
      .select(sql<number>`round(extensions.st_distance(tacka, ${tackaSql}))::int`.as('m'))
      .where('tacka', 'is not', null)
      .where('geo_preciznost', 'in', ['registarska_tacka', 'geokodirano'])
      .where(sql<boolean>`extensions.st_dwithin(tacka, ${tackaSql}, ${RADIJUS_RIZIKA_M})`)
      .orderBy('m').limit(1).executeTakeFirst();
    return red?.m ?? null;
  }

  /** Open reports near this one that it may be repeating. */
  async kandidatiDuplikati(prijavaId: string, tacka: Tacka | null, naseljeId: string | null): Promise<KandidatDuplikat[]> {
    const tackaSql = toPoint(tacka);

    let upit = this.db.selectFrom('app.prijava')
      .select([
        'id', 'kratki_kod', 'tip', 'opis',
        sql<number>`round(extract(epoch from now() - primljena_at) / 3600)::int`.as('sati_ranije'),
        tackaSql === null
          ? sql<number | null>`null::int`.as('rastojanje_m')
          : sql<number | null>`round(extensions.st_distance(tacka, ${tackaSql}))::int`.as('rastojanje_m'),
      ])
      .where('id', '!=', prijavaId)
      .where('status', 'in', ['nova', 'potvrdjena'])
      .where('primljena_at', '>', sql<Date>`now() - make_interval(hours => ${SATI_DUPLIKATA})`)
      .orderBy('primljena_at', 'desc')
      .limit(5);

    if (tackaSql !== null) {
      upit = upit.where(sql<boolean>`tacka is not null and extensions.st_dwithin(tacka, ${tackaSql}, ${RADIJUS_DUPLIKATA_M})`);
    } else if (naseljeId) {
      // No point to measure from, so the settlement is the whole neighbourhood.
      // These candidates are weaker, and the model is told their distance is
      // unknown rather than zero.
      upit = upit.where('naselje_id', '=', naseljeId);
    } else {
      return [];
    }

    return (await upit.execute()).map((red) => ({
      id: red.id, kratki_kod: red.kratki_kod, tip: red.tip, opis: red.opis,
      rastojanje_m: red.rastojanje_m, sati_ranije: red.sati_ranije,
    }));
  }
}
