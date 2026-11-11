import { Inject, Injectable } from '@nestjs/common';
import { Kysely, Transaction } from 'kysely';
import { toPoint } from '../../common/geo';
import { DATABASE, type Database } from '../../database/database.module';
import type { DB } from '../../database/generated/schema';
import type { AliasRow, NaseljeRow, RasporedRow } from './naselja-csv';

type Executor = Kysely<DB> | Transaction<DB>;

@Injectable()
export class NaseljaImportRepository {
  constructor(@Inject(DATABASE) private readonly db: Executor) {}

  /**
   * One transaction for the whole gazetteer. Aliases, coverage and the schedule
   * all point at settlements written in the same run, so a partial apply would
   * leave the alias table referencing rows that do not exist yet
   * (`db-use-transactions`).
   */
  async withTransaction<T>(work: (repo: NaseljaImportRepository) => Promise<T>): Promise<T> {
    return (this.db as Database)
      .transaction()
      .execute((trx) => work(new NaseljaImportRepository(trx)));
  }

  /**
   * Returns `naziv` → primary key.
   *
   * The key is the name within the municipality, not the place code: the registry
   * publishes a code for five of the 72 settlements. Existing rows are updated in
   * place, which matters because `sabirno_mesto` and the imported dumps already
   * hold their ids.
   */
  async upsertNaselja(rows: readonly NaseljeRow[]): Promise<Map<string, string>> {
    if (rows.length === 0) {
      return new Map();
    }

    const written = await this.db
      .insertInto('app.naselje')
      .values(
        rows.map((row) => ({
          naziv: row.naziv,
          sifra_mesta: row.sifra_mesta,
          centroid: toPoint(row.tacka)!,
          kategorija_naselja: row.kategorija_naselja,
          organizovano_prikupljanje: row.organizovano_prikupljanje,
          broj_domacinstava: row.broj_domacinstava,
        })),
      )
      .onConflict((oc) =>
        oc.columns(['naziv', 'opstina']).doUpdateSet((eb) => ({
          sifra_mesta: eb.ref('excluded.sifra_mesta'),
          centroid: eb.ref('excluded.centroid'),
          kategorija_naselja: eb.ref('excluded.kategorija_naselja'),
          organizovano_prikupljanje: eb.ref('excluded.organizovano_prikupljanje'),
          broj_domacinstava: eb.ref('excluded.broj_domacinstava'),
        })),
      )
      .returning(['id', 'naziv'])
      .execute();

    return new Map(written.map((row) => [row.naziv, row.id]));
  }

  async upsertAliasi(
    rows: readonly AliasRow[],
    naseljaIds: ReadonlyMap<string, string>,
  ): Promise<number> {
    const values = rows
      .map((row) => ({ row, naselje_id: naseljaIds.get(row.naselje) }))
      .filter((v): v is { row: AliasRow; naselje_id: string } => v.naselje_id !== undefined)
      .map(({ row, naselje_id }) => ({ alias: row.alias, naselje_id, izvor: row.izvor }));

    if (values.length === 0) {
      return 0;
    }

    const written = await this.db
      .insertInto('app.naselje_alias')
      .values(values)
      .onConflict((oc) =>
        oc.columns(['alias', 'izvor']).doUpdateSet((eb) => ({
          naselje_id: eb.ref('excluded.naselje_id'),
        })),
      )
      .returning('id')
      .execute();

    return written.length;
  }

  /** Keyed on settlement + source + year, so re-importing a document replaces it. */
  async upsertPokrivenost(
    rows: readonly NaseljeRow[],
    naseljaIds: ReadonlyMap<string, string>,
  ): Promise<number> {
    const values = rows
      .filter((row) => row.pokrivenost !== null && naseljaIds.has(row.naziv))
      .map((row) => ({
        naselje_id: naseljaIds.get(row.naziv)!,
        izvor: row.pokrivenost!.izvor,
        izvor_url: row.pokrivenost!.izvor_url,
        godina: row.pokrivenost!.godina,
        organizovano: row.pokrivenost!.organizovano,
        odvoz_nedeljno: row.pokrivenost!.odvoz_nedeljno,
        broj_domacinstava: row.pokrivenost!.broj_domacinstava,
        broj_stanovnika: row.pokrivenost!.broj_stanovnika,
        broj_kontejnera_1100l: row.pokrivenost!.broj_kontejnera_1100l,
      }));

    if (values.length === 0) {
      return 0;
    }

    const written = await this.db
      .insertInto('app.pokrivenost_naselja')
      .values(values)
      .onConflict((oc) =>
        oc.columns(['naselje_id', 'izvor', 'godina']).doUpdateSet((eb) => ({
          izvor_url: eb.ref('excluded.izvor_url'),
          organizovano: eb.ref('excluded.organizovano'),
          odvoz_nedeljno: eb.ref('excluded.odvoz_nedeljno'),
          broj_domacinstava: eb.ref('excluded.broj_domacinstava'),
          broj_stanovnika: eb.ref('excluded.broj_stanovnika'),
          broj_kontejnera_1100l: eb.ref('excluded.broj_kontejnera_1100l'),
        })),
      )
      .returning('id')
      .execute();

    return written.length;
  }

  /**
   * A published schedule is replaced whole, per source.
   *
   * There is no key to upsert on — a settlement can legitimately have several
   * rows for the same stream and weekday, one per street — and a schedule that
   * drops a street has to drop it here too, not keep serving last year's answer.
   * Scoping the delete to `izvor` leaves any other schedule alone.
   */
  async deleteRaspored(izvori: readonly string[]): Promise<number> {
    if (izvori.length === 0) {
      return 0;
    }

    const result = await this.db
      .deleteFrom('app.plan_odvoza')
      .where('izvor', 'in', izvori)
      .executeTakeFirst();

    return Number(result.numDeletedRows);
  }

  async insertRaspored(
    rows: readonly RasporedRow[],
    naseljaIds: ReadonlyMap<string, string>,
  ): Promise<number> {
    const values = rows
      .filter((row) => naseljaIds.has(row.naselje))
      .map((row) => ({
        naselje_id: naseljaIds.get(row.naselje)!,
        zona: row.zona,
        tip_otpada: row.tip_otpada,
        dan_u_nedelji: row.dan_u_nedelji,
        ciklus_dana: row.ciklus_dana,
        referentni_datum: row.referentni_datum,
        izvor: row.izvor,
        izvor_url: row.izvor_url,
      }));

    if (values.length === 0) {
      return 0;
    }

    const written = await this.db
      .insertInto('app.plan_odvoza')
      .values(values)
      .returning('id')
      .execute();

    return written.length;
  }
}
