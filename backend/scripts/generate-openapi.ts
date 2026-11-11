/**
 * Dumps the OpenAPI document to contracts/openapi.json.
 *
 * Determinism is the whole point: the same source must produce a byte-identical
 * file, otherwise the pre-commit guard (which fails on a non-empty git diff)
 * would block every commit for no reason. To get there we
 *   - boot the app without listening on a port,
 *   - sort every object key recursively,
 *   - sort the order-insensitive string arrays NestJS builds from decorator
 *     evaluation order (`required`, `tags`, `enum`),
 *   - serialise with a fixed 2-space indent and a trailing newline.
 *
 * Nothing time-, host- or environment-dependent may enter the document.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { applyBootStandins } from './boot-standins';
import { resolve } from 'node:path';

// Must run before AppModule is imported below: ConfigModule.forRoot's
// validate() executes synchronously as app.module.ts is evaluated, not when
// generate() runs, so setting this inside generate() was always too late —
// it was validating an unset DATABASE_URL and failing before this file's own
// code got a chance to run at all (devops-use-config-module).
//
// The values are shared with the integration runner rather than copied here,
// because copies of this list drift and CI is where that is discovered.
applyBootStandins();

import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { API_VERSION, buildOpenApiConfig } from '../src/openapi.config';

const CONTRACT_DIR = resolve(__dirname, '..', '..', 'contracts');
const SPEC_PATH = resolve(CONTRACT_DIR, 'openapi.json');
const CONTRACT_PKG_PATH = resolve(CONTRACT_DIR, 'package.json');

/**
 * Arrays whose element order carries no meaning and therefore must be sorted.
 *
 * `enum` is deliberately NOT in this set. Its order is meaningless to
 * validators but not to Prism: the mock returns the first enum member for a
 * field, so sorting it would silently change what the frontend develops
 * against. Decorator order is stable anyway, so there is nothing to gain.
 */
const ORDER_INSENSITIVE_KEYS = new Set(['required', 'tags']);

function canonicalise(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalise(item));
    if (key !== undefined && ORDER_INSENSITIVE_KEYS.has(key) && items.every((i) => typeof i === 'string')) {
      return [...(items as string[])].sort();
    }
    return items;
  }

  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.keys(source)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = canonicalise(source[k], k);
        return acc;
      }, {});
  }

  return value;
}

/** Keeps the published contract package version equal to the spec it ships. */
function syncContractPackageVersion(version: string): void {
  const pkg = JSON.parse(readFileSync(CONTRACT_PKG_PATH, 'utf8')) as Record<string, unknown>;
  if (pkg.version === version) return;
  pkg.version = version;
  writeFileSync(CONTRACT_PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  console.log(`contracts/package.json version -> ${version}`);
}

async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    const document = SwaggerModule.createDocument(app, buildOpenApiConfig());
    const canonical = canonicalise(document);
    writeFileSync(SPEC_PATH, `${JSON.stringify(canonical, null, 2)}\n`, 'utf8');
    syncContractPackageVersion(API_VERSION);
    console.log(`Wrote ${SPEC_PATH}`);
  } finally {
    await app.close();
  }
}

generate().catch((error: unknown) => {
  console.error('Failed to generate the OpenAPI document:');
  console.error(error);
  process.exit(1);
});
