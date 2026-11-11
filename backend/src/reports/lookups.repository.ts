import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database } from '../database/database.module';
import type { LookupQueryDto } from './dto/reports.dto';

@Injectable()
export class LookupsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  settlements(input: LookupQueryDto) {
    let query = this.db.selectFrom('app.naselje').select(['id', 'naziv']);
    if (input.search) query = query.where('naziv', 'ilike', `%${input.search}%`);
    return query.orderBy('naziv').orderBy('id').offset((input.page - 1) * input.limit).limit(input.limit + 1).execute();
  }

  intermediaries(input: LookupQueryDto) {
    let query = this.db.selectFrom('app.posrednik').select(['id', 'ime as naziv']).where('aktivan', '=', true);
    if (input.search) query = query.where('ime', 'ilike', `%${input.search}%`);
    return query.orderBy('ime').orderBy('id').offset((input.page - 1) * input.limit).limit(input.limit + 1).execute();
  }
}
