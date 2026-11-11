import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database } from '../database/database.module';
import type { AppMaterijalOtpada } from '../database/generated/schema';

/**
 * `pg` knows the array types it ships with, not ours: an `app.materijal_otpada[]`
 * column arrives as the raw literal "{metal,gume}", whatever the generated row
 * type says. Casting to text[] in SQL hands `pg` a type it parses, so the
 * service gets a real array.
 */
const materijali = sql<AppMaterijalOtpada[]>`materijali::text[]`.as('materijali');
const materialArray = (values: AppMaterijalOtpada[]) => sql<AppMaterijalOtpada[]>`cast(${values} as app.materijal_otpada[])`;

export type CollectorRow = { id: string; ime: string; prezime: string; telefon_e164: string; materijali: AppMaterijalOtpada[] };

/** How many collectors one answer lists; a popup is not a directory. */
const MAX_MATCHES = 10;

@Injectable()
export class CollectorsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** `@>` rather than `= any(...)`: containment is what the GIN index serves. */
  findByMaterijal(materijal: AppMaterijalOtpada): Promise<CollectorRow[]> {
    return this.db.selectFrom('app.sakupljac')
      .select(['id', 'ime', 'prezime', 'telefon_e164', materijali])
      .where('materijali', '@>', materialArray([materijal]))
      .orderBy('prezime').orderBy('ime').orderBy('id')
      .limit(MAX_MATCHES)
      .execute();
  }

  list(): Promise<CollectorRow[]> {
    return this.db.selectFrom('app.sakupljac')
      .select(['id', 'ime', 'prezime', 'telefon_e164', materijali])
      .orderBy('prezime').orderBy('ime').orderBy('id')
      .execute();
  }

  insert(values: Omit<CollectorRow, 'id'>): Promise<CollectorRow> {
    return this.db.insertInto('app.sakupljac')
      .values({ ...values, materijali: materialArray(values.materijali) })
      .returning(['id', 'ime', 'prezime', 'telefon_e164', materijali])
      .executeTakeFirstOrThrow();
  }

  remove(id: string) {
    return this.db.deleteFrom('app.sakupljac').where('id', '=', id).returning('id').executeTakeFirst();
  }
}
