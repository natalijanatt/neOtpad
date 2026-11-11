import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database } from './database.module';

export interface DatabaseProbe {
  reachable: boolean;
  latencyMs?: number;
}

/**
 * Isolates the one query the health endpoint runs.
 *
 * Its own class rather than three lines in the controller, so the controller
 * spec can assert the contract shape against a two-line fake instead of
 * standing up a query builder (test-mock-external-services).
 */
@Injectable()
export class DatabaseHealth {
  private readonly logger = new Logger(DatabaseHealth.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async check(): Promise<DatabaseProbe> {
    const started = Date.now();

    try {
      await sql`select 1`.execute(this.db);
      return { reachable: true, latencyMs: Date.now() - started };
    } catch (error) {
      this.logger.error(`database unreachable: ${(error as Error).message}`);
      return { reachable: false };
    }
  }
}
