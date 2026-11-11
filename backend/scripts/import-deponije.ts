/**
 * Imports the Pirot illegal-dump exports from `waste-scraper/data/` into
 * `app.deponija_kanonska`, `app.deponija_lokacija` and `app.deponija_opservacija`.
 *
 *   npm run import:deponije
 *   npm run import:deponije -- --dry-run
 *   npm run import:deponije -- --dir ../waste-scraper/data --report import.json
 *
 * Re-running is safe: rows are keyed on `kanonski_id` / `location_id` and
 * updated in place. `--dry-run` executes every statement and rolls back, which
 * is the only honest way to find out whether a corrected CSV still satisfies the
 * table constraints.
 *
 * This is a command rather than an endpoint. It needs the repository checkout to
 * read the files and it rewrites reference data wholesale — neither belongs
 * behind HTTP.
 */
import { NestFactory } from '@nestjs/core';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { parseCsv } from '../src/common/csv/csv';
import { DEPONIJE_CSV_FILES } from '../src/deponije/import/deponije-csv';
import {
  DeponijeImportService,
  type ImportReport,
} from '../src/deponije/import/deponije-import.service';

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
    kanonske: readCsv(args.dir, DEPONIJE_CSV_FILES.kanonske),
    lokacije: readCsv(args.dir, DEPONIJE_CSV_FILES.lokacije),
    opservacije: readCsv(args.dir, DEPONIJE_CSV_FILES.opservacije),
  };

  // Warnings from the mapping are logged by the service; the CLI prints the
  // numbers a person needs to decide whether the run did what they wanted.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const service = app.get(DeponijeImportService);
    const report = await service.import(input, { dryRun: args.dryRun });

    if (args.reportPath !== null) {
      writeFileSync(args.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }

    printReport(report, args.reportPath);
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

function printReport(report: ImportReport, reportPath: string | null): void {
  const lines = [
    '',
    report.dryRun ? 'Dry run — everything below was rolled back.' : 'Import finished.',
    '',
    `  kanonske deponije   read ${report.kanonske.read}, written ${report.kanonske.written}`,
    `  lokacije            read ${report.lokacije.read}, written ${report.lokacije.written}`,
    `  opservacije         read ${report.opservacije.read}, written ${report.opservacije.written}` +
      `, replaced ${report.opservacije.deleted}`,
  ];

  if (report.nerazresenaNaselja.length > 0) {
    lines.push(
      '',
      `Settlement names that matched nothing (${report.nerazresenaNaselja.length}). Those rows`,
      'kept their coordinates but have no naselje_id. Each one is either a new',
      'settlement or an app.naselje_alias row — both are a decision, not an import:',
      '',
      ...report.nerazresenaNaselja.map(({ naziv, redova }) => `  ${redova}×  ${naziv}`),
    );
  }

  lines.push(
    '',
    `Warnings: ${report.warnings.length}${report.warnings.length > 0 ? ' (logged above)' : ''}`,
  );

  if (reportPath !== null) {
    lines.push(`Full report: ${reportPath}`);
  }

  lines.push('');
  console.log(lines.join('\n'));
}

void main().catch((error: unknown) => {
  console.error(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
