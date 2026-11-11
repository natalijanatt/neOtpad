import { Injectable, Logger } from '@nestjs/common';
import type { CsvRow } from '../../common/csv/csv';
import { ImportWarnings } from '../../common/csv/csv-values';
import {
  type AliasRow,
  type NaseljeRow,
  type RasporedRow,
  mapAliasi,
  mapNaselja,
  mapRaspored,
} from './naselja-csv';
import { NaseljaImportRepository } from './naselja-import.repository';

export interface NaseljaCsvInput {
  naselja: readonly CsvRow[];
  aliasi: readonly CsvRow[];
  raspored: readonly CsvRow[];
}

export interface ImportOptions {
  dryRun: boolean;
}

export interface NaseljaImportReport {
  dryRun: boolean;
  naselja: { read: number; written: number };
  aliasi: { read: number; written: number };
  pokrivenost: { written: number };
  raspored: { read: number; written: number; deleted: number };
  /** Coverage as the import leaves it, which is the number the risk model reads. */
  pokrivenoNaselja: number;
  nepoznataPokrivenost: number;
  warnings: readonly string[];
}

class DryRunComplete extends Error {
  constructor(readonly report: NaseljaImportReport) {
    super('dry run finished');
  }
}

/**
 * Imports the settlement gazetteer: every settlement of the City of Pirot, the
 * names the sources use for them, what each document says about organised
 * collection, and the published collection schedule.
 *
 * This is the import that makes the dump data joinable — without it most dump
 * rows sit in a settlement that does not exist in the database. It runs before
 * `import:deponije`, and re-running either is safe.
 */
@Injectable()
export class NaseljaImportService {
  private readonly logger = new Logger(NaseljaImportService.name);

  constructor(private readonly repository: NaseljaImportRepository) {}

  async import(input: NaseljaCsvInput, options: ImportOptions): Promise<NaseljaImportReport> {
    const warnings = new ImportWarnings();

    const naselja = mapNaselja(input.naselja, warnings);
    const aliasi = mapAliasi(input.aliasi, warnings);
    const raspored = mapRaspored(input.raspored, warnings);

    const poznata = new Set(naselja.map((row) => row.naziv));
    this.reportUnknownReferences(aliasi, raspored, poznata, warnings);

    const report = await this.write({ naselja, aliasi, raspored }, options, {
      read: {
        naselja: input.naselja.length,
        aliasi: input.aliasi.length,
        raspored: input.raspored.length,
      },
      warnings,
    });

    for (const message of report.warnings) {
      this.logger.warn(message);
    }

    return report;
  }

  /**
   * An alias or a schedule row naming a settlement that is not in the gazetteer
   * is a build error in `waste-scraper/scripts/`, not something to paper over:
   * the row would be dropped on insert and the schedule would quietly lose a
   * street.
   */
  private reportUnknownReferences(
    aliasi: readonly AliasRow[],
    raspored: readonly RasporedRow[],
    poznata: ReadonlySet<string>,
    warnings: ImportWarnings,
  ): void {
    for (const row of aliasi) {
      if (!poznata.has(row.naselje)) {
        warnings.add(`alias "${row.alias}"`, `points at unknown settlement "${row.naselje}", skipped`);
      }
    }

    for (const row of raspored) {
      if (!poznata.has(row.naselje)) {
        warnings.add(
          `raspored "${row.zona ?? row.naselje}"`,
          `unknown settlement "${row.naselje}", skipped`,
        );
      }
    }
  }

  private async write(
    rows: { naselja: NaseljeRow[]; aliasi: AliasRow[]; raspored: RasporedRow[] },
    options: ImportOptions,
    context: {
      read: { naselja: number; aliasi: number; raspored: number };
      warnings: ImportWarnings;
    },
  ): Promise<NaseljaImportReport> {
    const run = async (repo: NaseljaImportRepository): Promise<NaseljaImportReport> => {
      const ids = await repo.upsertNaselja(rows.naselja);
      const aliasi = await repo.upsertAliasi(rows.aliasi, ids);
      const pokrivenost = await repo.upsertPokrivenost(rows.naselja, ids);

      const izvori = [...new Set(rows.raspored.map((row) => row.izvor))];
      const deleted = await repo.deleteRaspored(izvori);
      const raspored = await repo.insertRaspored(rows.raspored, ids);

      return {
        dryRun: options.dryRun,
        naselja: { read: context.read.naselja, written: ids.size },
        aliasi: { read: context.read.aliasi, written: aliasi },
        pokrivenost: { written: pokrivenost },
        raspored: { read: context.read.raspored, written: raspored, deleted },
        pokrivenoNaselja: rows.naselja.filter((r) => r.organizovano_prikupljanje === 'da').length,
        nepoznataPokrivenost: rows.naselja.filter(
          (r) => r.organizovano_prikupljanje === 'nepoznato',
        ).length,
        warnings: context.warnings.messages,
      };
    };

    if (!options.dryRun) {
      return this.repository.withTransaction(run);
    }

    try {
      await this.repository.withTransaction(async (repo) => {
        throw new DryRunComplete(await run(repo));
      });
    } catch (error) {
      if (error instanceof DryRunComplete) {
        return error.report;
      }
      throw error;
    }

    throw new Error('dry run did not roll back');
  }
}
