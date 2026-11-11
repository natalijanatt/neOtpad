import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database } from '../database/database.module';
import type { AppMaterijalOtpada } from '../database/generated/schema';

@Injectable()
export class SitesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  list() {
    return this.db.selectFrom('app.mesto_odlaganja')
      .select(['id', 'naziv', 'tip', 'adresa', 'lokacija', 'geo_preciznost', 'radno_vreme', 'prima', 'izvor',
        // Enum array → text[] so `pg` parses it (see collectors.repository.ts).
        sql<AppMaterijalOtpada[]>`materijali::text[]`.as('materijali')])
      .orderBy('naziv')
      .execute();
  }
}
