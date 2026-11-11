import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { isEmail, isUUID } from 'class-validator';
import { sql } from 'kysely';
import { AppModule } from '../src/app.module';
import { DATABASE, type Database } from '../src/database/database.module';
import { STORAGE, type StoragePort } from '../src/storage/storage.port';
import { hashPassword } from '../src/auth/password';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const database = app.get<Database>(DATABASE);
    const config = app.get(ConfigService);
    const mode = process.argv[2];
    if (mode === 'staff') {
      const email = config.get<string>('STAFF_EMAIL', '').trim().toLowerCase();
      const name = config.get<string>('STAFF_NAME', '').trim();
      const role = config.get<string>('STAFF_ROLE', 'dispecer');
      const password = config.get<string>('STAFF_PASSWORD', '');
      if (!isEmail(email) || email.length > 254 || !name || name.length > 200
        || !['admin', 'dispecer', 'vozac'].includes(role) || password.length < 12 || password.length > 128) {
        throw new Error('Set STAFF_EMAIL, STAFF_NAME, STAFF_ROLE (admin/dispecer/vozac), and STAFF_PASSWORD (12-128 characters)');
      }
      const hash = await hashPassword(password);
      const row = await database.insertInto('app.korisnik').values({ email, ime: name, uloga: role as 'admin' | 'dispecer' | 'vozac', lozinka_hash: hash })
        .returning('id').executeTakeFirstOrThrow();
      console.log(`Created staff ${row.id}. Existing accounts are never overwritten.`);
    } else if (mode === 'intermediary') {
      const name = config.get<string>('INTERMEDIARY_NAME', '').trim();
      const role = config.get<string>('INTERMEDIARY_ROLE', '').trim();
      const community = config.get<string>('INTERMEDIARY_COMMUNITY_ID');
      const phone = config.get<string>('INTERMEDIARY_PHONE');
      if (!name || name.length > 200 || !role || role.length > 100 || (community && !isUUID(community))
        || (phone && !/^\+[1-9]\d{6,14}$/.test(phone))) {
        throw new Error('Set INTERMEDIARY_NAME and INTERMEDIARY_ROLE; optional COMMUNITY_ID must be UUID and PHONE must be E.164');
      }
      const row = await database.insertInto('app.posrednik').values({ ime: name, uloga: role, mesna_zajednica_id: community ?? null, telefon_e164: phone ?? null })
        .returning('id').executeTakeFirstOrThrow();
      console.log(`Created intermediary ${row.id}`);
    } else if (mode === 'cleanup-limits') {
      const result = await database.deleteFrom('app.api_limit').where('istice_at', '<', sql<Date>`now()`).executeTakeFirst();
      console.log(`Removed ${result.numDeletedRows} expired rate-limit counters`);
    } else if (mode === 'cleanup-photos') {
      // Uploads nobody ever claimed. The row is deleted first and the object
      // after, so a failure here leaves an object the next sweep picks up
      // rather than a live row pointing at nothing.
      const storage = app.get<StoragePort>(STORAGE);
      const stale = await database.selectFrom('app.prijava_foto').select(['id', 'kljuc'])
        .where('prijava_id', 'is', null).where('istice_at', '<=', sql<Date>`now()`)
        .limit(1000).execute();
      for (const foto of stale) {
        await database.deleteFrom('app.prijava_foto').where('id', '=', foto.id).execute();
        await storage.remove(foto.kljuc);
      }
      console.log(`Removed ${stale.length} unclaimed report photos`);
    } else {
      throw new Error('Expected staff, intermediary, cleanup-limits or cleanup-photos');
    }
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  const code = (error as { code?: string }).code;
  console.error(code === '23505' ? 'Account already exists; no changes made.'
    : code === '23503' ? 'Referenced community does not exist.'
    : error instanceof Error && !code ? error.message : 'Provisioning failed. Check configuration and database availability.');
  process.exitCode = 1;
});
