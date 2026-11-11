import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from 'pg';
import { BOOT_STANDINS } from './boot-standins';

async function main(): Promise<void> {
  const adminUrl = new URL(process.env.TEST_ADMIN_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(adminUrl.hostname)) {
    throw new Error('Integration database runner only accepts a local PostgreSQL server');
  }
  const databaseName = `reports_test_${randomBytes(8).toString('hex')}`;
  const admin = new Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 5000 });
  await admin.connect();
  let created = false;
  try {
    await admin.query(`create database "${databaseName}"`);
    created = true;
    const testUrl = new URL(adminUrl);
    testUrl.pathname = `/${databaseName}`;
    const client = new Client({ connectionString: testUrl.toString() });
    await client.connect();
    try {
      await client.query('create schema extensions');
      await client.query('set search_path = public, extensions');
      const migrations = resolve(__dirname, '../../supabase/migrations');
      for (const file of readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort()) {
        await client.query(readFileSync(resolve(migrations, file), 'utf8'));
      }
      await client.query(readFileSync(resolve(__dirname, '../../supabase/seed.sql'), 'utf8'));
    } finally {
      await client.end();
    }
    const generate = process.argv.includes('--types');
    const script = generate ? 'node_modules/kysely-codegen/dist/cli/bin.js' : 'node_modules/jest/bin/jest.js';
    const args = generate
      ? ['--dialect', 'postgres', '--include-pattern', 'app.*', '--out-file', 'src/database/generated/schema.ts']
      : ['--runInBand', '--testRegex', '.*\\.integration-spec\\.ts$'];
    const code = await new Promise<number>((resolveCode, reject) => {
      const child = spawn(process.execPath, [script, ...args], {
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit',
        env: {
          ...process.env,
          ...BOOT_STANDINS,
          DATABASE_URL: testUrl.toString(),
          TEST_DATABASE_URL: testUrl.toString(),
          NODE_ENV: 'test',
          JWT_SECRET: randomBytes(48).toString('hex'),
          // The integration spec boots the whole AppModule, so every provider is
          // constructed - including the storage client, which resolves its
          // configuration eagerly so a misconfigured deployment dies on startup
          // rather than on a citizen's first photograph. CI has no bucket and
          // no keys, and these tests never upload, so the shared stand-ins keep
          // that boot-time check honest without inventing infrastructure.
          // Spread first: the real DATABASE_URL and JWT_SECRET above must win.
        },
      });
      child.on('error', reject);
      child.on('exit', (status) => resolveCode(status ?? 1));
    });
    if (code !== 0) throw new Error(`Database verification exited with ${code}`);
  } finally {
    if (created && /^reports_test_[a-f0-9]{16}$/.test(databaseName)) {
      await admin.query(`drop database "${databaseName}" with (force)`);
    }
    await admin.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Database verification failed');
  process.exitCode = 1;
});
