import { Inject, Injectable } from '@nestjs/common';
import { Kysely, Transaction } from 'kysely';
import { DATABASE, type Database } from '../../database/database.module';
import type { DB } from '../../database/generated/schema';
import { toPoint } from '../../common/geo';
import type { KanonskaRow, LokacijaRow, OpservacijaRow, Resolved } from './deponije-csv';
import type { NaseljeName } from './naselje-resolver';

/** Either the pool-backed instance or a transaction, so writes can share one. */
type Executor = Kysely<DB> | Transaction<DB>;

/**
 * Every statement the dump import issues.
 *
 * Writes are upserts on the natural key the sources themselves carry
 * (`kanonski_id`, `location_id`), so a re-run after a corrected CSV updates the
 * rows in place. Anything reading these tables keeps its foreign keys.
 */
@Injectable()
export class DeponijeImportRepository {
  constructor(@Inject(DATABASE) private readonly db: Executor) {}

  /**
   * Runs `work` against a repository bound to a single transaction. The three
   * files reference each other, so a half-applied import would leave
   * observations pointing at locations that were never written
   * (`db-use-transactions`).
   */
  async withTransaction<T>(work: (repo: DeponijeImportRepository) => Promise<T>): Promise<T> {
    return (this.db as Database)
      .transaction()
      .execute((trx) => work(new DeponijeImportRepository(trx)));
  }

  /** Official names and aliases together — both are valid ways in. */
  async findNaseljeNames(): Promise<NaseljeName[]> {
    const rows = await this.db
      .selectFrom('app.naselje')
      .select(['id as naselje_id', 'naziv'])
      .union(
        this.db.selectFrom('app.naselje_alias').select(['naselje_id', 'alias as naziv']),
      )
      .execute();

    return rows;
  }

  /** Returns `kanonski_id` → primary key, for the locations that reference it. */
  async upsertKanonske(rows: readonly Resolved<KanonskaRow>[]): Promise<Map<string, string>> {
    if (rows.length === 0) {
      return new Map();
    }

    const written = await this.db
      .insertInto('app.deponija_kanonska')
      .values(
        rows.map((row) => ({
          kanonski_id: row.kanonski_id,
          naziv: row.naziv,
          naselje_id: row.naselje_id,
          tacka: toPoint(row.tacka),
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
        })),
      )
      .onConflict((oc) =>
        oc.column('kanonski_id').doUpdateSet((eb) => ({
          naziv: eb.ref('excluded.naziv'),
          naselje_id: eb.ref('excluded.naselje_id'),
          tacka: eb.ref('excluded.tacka'),
          geo_preciznost: eb.ref('excluded.geo_preciznost'),
          prvi_put_zabelezena: eb.ref('excluded.prvi_put_zabelezena'),
          poslednji_put_zabelezena: eb.ref('excluded.poslednji_put_zabelezena'),
          godine_evidentirana: eb.ref('excluded.godine_evidentirana'),
          izvori: eb.ref('excluded.izvori'),
          broj_izvornih_redova: eb.ref('excluded.broj_izvornih_redova'),
          broj_opservacija: eb.ref('excluded.broj_opservacija'),
          ponovo_se_stvara: eb.ref('excluded.ponovo_se_stvara'),
          status: eb.ref('excluded.status'),
          spajanje_pouzdanost: eb.ref('excluded.spajanje_pouzdanost'),
        })),
      )
      .returning(['id', 'kanonski_id'])
      .execute();

    return new Map(written.map((row) => [row.kanonski_id, row.id]));
  }

  /** Returns `location_id` → primary key, for the observations that reference it. */
  async upsertLokacije(
    rows: readonly Resolved<LokacijaRow>[],
    kanonskaIds: ReadonlyMap<string, string>,
  ): Promise<Map<string, string>> {
    if (rows.length === 0) {
      return new Map();
    }

    const written = await this.db
      .insertInto('app.deponija_lokacija')
      .values(
        rows.map((row) => ({
          location_id: row.location_id,
          kanonska_id: row.kanonski_id === null ? null : (kanonskaIds.get(row.kanonski_id) ?? null),
          naziv: row.naziv,
          naselje_id: row.naselje_id,
          tacka: toPoint(row.tacka),
          geo_preciznost: row.geo_preciznost,
          katastarska_parcela: row.katastarska_parcela,
          katastarska_opstina: row.katastarska_opstina,
          prvi_put_zabelezena: row.prvi_put_zabelezena,
          poslednji_put_zabelezena: row.poslednji_put_zabelezena,
          godine_evidentirana: row.godine_evidentirana,
          tip_otpada_opis: row.tip_otpada_opis,
          povrsina_m2: row.povrsina_m2,
          zapremina_m3: row.zapremina_m3,
          kolicina_t: row.kolicina_t,
          ciscenja_godisnje: row.ciscenja_godisnje,
          ociscena_datum: row.ociscena_datum,
          ponovo_se_stvara: row.ponovo_se_stvara,
          status: row.status,
          izvor: row.izvor,
          izvor_url: row.izvor_url,
          napomena: row.napomena,
          spajanje_pouzdanost: row.spajanje_pouzdanost,
          spajanje_razlog: row.spajanje_razlog,
        })),
      )
      .onConflict((oc) =>
        oc.column('location_id').doUpdateSet((eb) => ({
          kanonska_id: eb.ref('excluded.kanonska_id'),
          naziv: eb.ref('excluded.naziv'),
          naselje_id: eb.ref('excluded.naselje_id'),
          tacka: eb.ref('excluded.tacka'),
          geo_preciznost: eb.ref('excluded.geo_preciznost'),
          katastarska_parcela: eb.ref('excluded.katastarska_parcela'),
          katastarska_opstina: eb.ref('excluded.katastarska_opstina'),
          prvi_put_zabelezena: eb.ref('excluded.prvi_put_zabelezena'),
          poslednji_put_zabelezena: eb.ref('excluded.poslednji_put_zabelezena'),
          godine_evidentirana: eb.ref('excluded.godine_evidentirana'),
          tip_otpada_opis: eb.ref('excluded.tip_otpada_opis'),
          povrsina_m2: eb.ref('excluded.povrsina_m2'),
          zapremina_m3: eb.ref('excluded.zapremina_m3'),
          kolicina_t: eb.ref('excluded.kolicina_t'),
          ciscenja_godisnje: eb.ref('excluded.ciscenja_godisnje'),
          ociscena_datum: eb.ref('excluded.ociscena_datum'),
          ponovo_se_stvara: eb.ref('excluded.ponovo_se_stvara'),
          status: eb.ref('excluded.status'),
          izvor: eb.ref('excluded.izvor'),
          izvor_url: eb.ref('excluded.izvor_url'),
          napomena: eb.ref('excluded.napomena'),
          spajanje_pouzdanost: eb.ref('excluded.spajanje_pouzdanost'),
          spajanje_razlog: eb.ref('excluded.spajanje_razlog'),
        })),
      )
      .returning(['id', 'location_id'])
      .execute();

    return new Map(written.map((row) => [row.location_id, row.id]));
  }

  /**
   * Observations carry no identifier of their own — the same location can be
   * recorded twice in one year by two documents — so there is no key to upsert
   * on. They are replaced wholesale instead, scoped to the locations this import
   * owns, which leaves observations created by any other path untouched.
   *
   * `prijava_id is null` is what makes that last clause true. A confirmed report
   * attaches its observation to an imported canonical site and has no location of
   * its own, so without it the second branch below would delete every citizen
   * observation on every import run.
   */
  async deleteOpservacijeFor(
    lokacijaIds: readonly string[],
    kanonskaIds: readonly string[],
  ): Promise<number> {
    if (lokacijaIds.length === 0 && kanonskaIds.length === 0) {
      return 0;
    }

    const result = await this.db
      .deleteFrom('app.deponija_opservacija')
      .where((eb) =>
        eb.or([
          ...(lokacijaIds.length > 0 ? [eb('lokacija_id', 'in', lokacijaIds)] : []),
          // An observation the sources attach to a canonical site but to no
          // location would otherwise survive the delete and be inserted a second
          // time on the next run.
          ...(kanonskaIds.length > 0
            ? [
                eb.and([
                  eb('lokacija_id', 'is', null),
                  eb('prijava_id', 'is', null),
                  eb('kanonska_id', 'in', kanonskaIds),
                ]),
              ]
            : []),
        ]),
      )
      .executeTakeFirst();

    return Number(result.numDeletedRows);
  }

  async insertOpservacije(
    rows: readonly OpservacijaRow[],
    lokacijaIds: ReadonlyMap<string, string>,
    kanonskaIds: ReadonlyMap<string, string>,
  ): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }

    const written = await this.db
      .insertInto('app.deponija_opservacija')
      .values(
        rows.map((row) => ({
          lokacija_id: row.location_id === null ? null : (lokacijaIds.get(row.location_id) ?? null),
          kanonska_id: row.kanonski_id === null ? null : (kanonskaIds.get(row.kanonski_id) ?? null),
          datum: row.datum,
          godina: row.godina,
          tip_dogadjaja: row.tip_dogadjaja,
          tacka: toPoint(row.tacka),
          povrsina_m2: row.povrsina_m2,
          zapremina_m3: row.zapremina_m3,
          kolicina_t: row.kolicina_t,
          broj_deponija: row.broj_deponija,
          izvor: row.izvor,
          izvor_url: row.izvor_url,
          opis: row.opis,
        })),
      )
      .returning('id')
      .execute();

    return written.length;
  }
}

