/**
 * Imports the settlement gazetteer from `waste-scraper/data/` into `app.naselje`,
 * `app.naselje_alias`, `app.pokrivenost_naselja` and `app.plan_odvoza`.
 *
 *   npm run import:naselja
 *   npm run import:naselja -- --dry-run
 *
 * Run this before `npm run import:deponije`: most dump rows name a settlement,
 * and without the gazetteer there is nothing for them to point at.
 *
 * The files come from `waste-scraper/scripts/build_naselja.py` and
 * `scrape_komunalac_raspored.py`, which carry the provenance of every value.
 */
import { NestFactory } from '@nestjs/core';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { parseCsv } from '../src/common/csv/csv';
import { NASELJA_CSV_FILES } from '../src/geo/import/naselja-csv';
import {
  NaseljaImportService,
  type NaseljaImportReport,
} from '../src/geo/import/naselja-import.service';

const DEFAULT_DIR = resolve(__dirname, '..', '..', 'waste-scraper', 'data');

interface Args {
  dir: string;
  dryRun: boolean;
  reportPath: string | null;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { dir: DEFAULT_DIR, dryRun: false, reportPath: null };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--dir':
        args.dir = resolve(requireValue(argv, ++i, '--dir'));
        break;
      case '--report':
        args.reportPath = resolve(requireValue(argv, ++i, '--report'));
        break;
      default:
        throw new Error(`Unknown argument "${argv[i]}"`);
    }
  }

  return args;
}

function requireValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} needs a value`);
  }
  return value;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const input = {
    naselja: readCsv(args.dir, NASELJA_CSV_FILES.naselja),
    aliasi: readCsv(args.dir, NASELJA_CSV_FILES.aliasi),
    raspored: readCsv(args.dir, NASELJA_CSV_FILES.raspored),
  };

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const report = await app.get(NaseljaImportService).import(input, { dryRun: args.dryRun });

    if (args.reportPath !== null) {
      writeFileSync(args.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }

    printReport(report);
  } finally {
    await app.close();
  }
}

function readCsv(dir: string, file: string) {
  const path = resolve(dir, file);

  try {
    return parseCsv(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${path}: ${(error as Error).message}`);
  }
}

function printReport(report: NaseljaImportReport): void {
  console.log(
    [
      '',
      report.dryRun ? 'Dry run — everything below was rolled back.' : 'Import finished.',
      '',
      `  naselja       read ${report.naselja.read}, written ${report.naselja.written}`,
      `  aliasi        read ${report.aliasi.read}, written ${report.aliasi.written}`,
      `  pokrivenost   written ${report.pokrivenost.written}`,
      `  raspored      read ${report.raspored.read}, written ${report.raspored.written}` +
        `, replaced ${report.raspored.deleted}`,
      '',
      `Organised collection: ${report.pokrivenoNaselja} settlements yes, ` +
        `${report.naselja.written - report.pokrivenoNaselja - report.nepoznataPokrivenost} no, ` +
        `${report.nepoznataPokrivenost} not established.`,
      `Warnings: ${report.warnings.length}${report.warnings.length > 0 ? ' (logged above)' : ''}`,
      '',
    ].join('\n'),
  );
}

void main().catch((error: unknown) => {
  console.error(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
