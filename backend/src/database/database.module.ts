import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from './generated/schema';

/** Injection token for the query builder (di-use-interfaces-tokens). */
export const DATABASE = Symbol('DATABASE');

/** What repositories inject. Services never see this type; repositories do. */
export type Database = Kysely<DB>;

const logger = new Logger('Database');

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Database => {
        const pool = new Pool({
          connectionString: config.getOrThrow<string>('DATABASE_URL'),
          // Domain tables live in `app` and PostGIS in `extensions`. Setting the
          // search_path here means raw sql`` fragments read the same as the
          // migrations do; Kysely itself uses the schema-qualified names that
          // codegen emits, so this is a convenience, not a correctness crutch.
          options: '-c search_path=app,public,extensions',
          // A hackathon laptop running the API, Postgres and a mock server does
          // not benefit from a large pool, and a small one surfaces a leaked
          // connection immediately instead of an hour later.
          max: 10,
        });

        pool.on('error', (err) => {
          // An idle client erroring out is normal on network blips; it must not
          // reach the default handler, which would take the process down.
          logger.error(`idle client error: ${err.message}`);
        });

        return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
      },
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** In-flight queries finish before the pool closes (devops-graceful-shutdown). */
  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}
