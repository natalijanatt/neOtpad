import { Inject, Injectable } from '@nestjs/common';
import { sql, type Insertable, type Updateable } from 'kysely';
import { DATABASE, type Database } from '../database/database.module';
import type { DB } from '../database/generated/schema';
import type { NewsQueryDto } from './dto/news.dto';

export type NewsInsert = Insertable<DB['app.vest']>;
export type NewsUpdate = Updateable<DB['app.vest']>;

@Injectable()
export class NewsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Feed order is `vest_feed_idx`, not a sort in memory: pinned first, then
   * newest, with the identifier as tie-breaker so paging cannot repeat or skip
   * a post published in the same millisecond.
   */
  list(input: NewsQueryDto) {
    let query = this.db.selectFrom('app.vest').selectAll();
    if (input.naselje_id) {
      // A settlement feed includes municipal posts. Filtering them out would
      // hide "the truck does not run on the holiday" from every village.
      const naselje = input.naselje_id;
      query = query.where((expression) => expression.or([expression('naselje_id', '=', naselje), expression('naselje_id', 'is', null)]));
    }
    if (input.kategorija) query = query.where('kategorija', '=', input.kategorija);
    return query
      .orderBy('zakacena', 'desc').orderBy('objavljena_at', 'desc').orderBy('id', 'desc')
      .offset((input.page - 1) * input.limit)
      // One more than asked for: that is how hasMore is known without a count.
      .limit(input.limit + 1)
      .execute();
  }

  find(id: string) {
    return this.db.selectFrom('app.vest').selectAll().where('id', '=', id).executeTakeFirst();
  }

  findSettlement(id: string) {
    return this.db.selectFrom('app.naselje').select('id').where('id', '=', id).executeTakeFirst();
  }

  insert(values: NewsInsert) {
    return this.db.insertInto('app.vest').values(values).returningAll().executeTakeFirstOrThrow();
  }

  /**
   * Version-guarded: the update matches only while the post is still the one the
   * editor read, so a concurrent edit loses instead of silently overwriting.
   * `objavljena_at` is never touched — the feed is not a list of recent edits.
   */
  update(id: string, version: number, values: NewsUpdate) {
    return this.db.updateTable('app.vest')
      .set({ ...values, verzija: version + 1, azurirana_at: sql<Date>`clock_timestamp()` })
      .where('id', '=', id).where('verzija', '=', version)
      .returningAll().executeTakeFirst();
  }

  remove(id: string) {
    return this.db.deleteFrom('app.vest').where('id', '=', id).returning('id').executeTakeFirst();
  }
}
