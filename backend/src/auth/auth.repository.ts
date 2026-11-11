import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database } from '../database/database.module';

@Injectable()
export class AuthRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  findByEmail(email: string) {
    return this.db.selectFrom('app.korisnik').selectAll()
      .where(sql<string>`lower(email)`, '=', email).executeTakeFirst();
  }

  findById(id: string) {
    return this.db.selectFrom('app.korisnik').select(['id', 'ime', 'uloga', 'aktivan'])
      .where('id', '=', id).executeTakeFirst();
  }
}
