import { Injectable, Logger } from '@nestjs/common';
import type { CsvRow } from '../../common/csv/csv';
import { ImportWarnings } from '../../common/csv/csv-values';
import {
  type KanonskaRow,
  type LokacijaRow,
  type OpservacijaRow,
  type Resolved,
  mapKanonske,
  mapLokacije,
  mapOpservacije,
} from './deponije-csv';
import { DeponijeImportRepository } from './deponije-import.repository';
import { NaseljeResolver } from './naselje-resolver';

/** The three parsed files, in the order their foreign keys require. */
export interface DeponijeCsvInput {
  kanonske: readonly CsvRow[];
  lokacije: readonly CsvRow[];
  opservacije: readonly CsvRow[];
}

export interface ImportOptions {
  /** Do everything, including the writes, then roll back. */
  dryRun: boolean;
}

export interface TableCounts {
  read: number;
  written: number;
  skipped: number;
}

/** A settlement name from a source document that matched nothing in the database. */
export interface NerazresenoNaselje {
  naziv: string;
  redova: number;
}

export interface ImportReport {
  dryRun: boolean;
  kanonske: TableCounts;
  lokacije: TableCounts;
  opservacije: TableCounts & { deleted: number };
  /** Review tasks: each becomes an `app.naselje_alias` row or a new settlement. */
  nerazresenaNaselja: NerazresenoNaselje[];
  warnings: readonly string[];
}

/** Carries the finished report out of the transaction that is about to roll back. */
class DryRunComplete extends Error {
  constructor(readonly report: ImportReport) {
    super('dry run finished');
  }
}

/**
 * Imports the Pirot illegal-dump exports into `app.deponija_*`.
 *
 * Re-running is the normal case, not a recovery step: the scraper is still being
 * corrected, and every run replaces what the previous one wrote for the same
 * natural keys. Rows the sources cannot justify are never invented — an
 * unmatched settlement leaves `naselje_id` NULL and appears on the report
 * instead, because a village conjured from a string in a PDF would carry an
 * `organizovano_prikupljanje` flag nobody ever checked.
 */
@Injectable()
export class DeponijeImportService {
  private readonly logger = new Logger(DeponijeImportService.name);

  constructor(private readonly repository: DeponijeImportRepository) {}

  async import(input: DeponijeCsvInput, options: ImportOptions): Promise<ImportReport> {
    const warnings = new ImportWarnings();

    const kanonske = mapKanonske(input.kanonske, warnings);
    const lokacije = mapLokacije(input.lokacije, warnings);
    const opservacije = mapOpservacije(input.opservacije, warnings);

    const resolver = new NaseljeResolver(await this.repository.findNaseljeNames());
    const nerazresena = new Map<string, number>();

    const resolveNaselje = <T extends { naselje: string | null }>(row: T): Resolved<T> => {
      const naselje_id = resolver.resolve(row.naselje);

      if (naselje_id === null && row.naselje !== null) {
        nerazresena.set(row.naselje, (nerazresena.get(row.naselje) ?? 0) + 1);
      }

      return { ...row, naselje_id };
    };

    const kanonskeRows = kanonske.map(resolveNaselje);
    const lokacijeRows = lokacije.map(resolveNaselje);

    const usable = this.dropDanglingRows(kanonskeRows, lokacijeRows, opservacije, warnings);

    const report = await this.write(usable, options, {
      read: {
        kanonske: input.kanonske.length,
        lokacije: input.lokacije.length,
        opservacije: input.opservacije.length,
      },
      nerazresena,
      warnings,
    });

    for (const message of report.warnings) {
      this.logger.warn(message);
    }

    return report;
  }

  /**
   * Drops rows whose parent is missing from this import. The three files are
   * generated together and normally agree; when they do not, a location pointing
   * at a canonical id that no longer exists would silently become an orphan with
   * `kanonska_id` NULL, which reads downstream as "never merged with anything" —
   * the opposite of the truth.
   */
  private dropDanglingRows(
    kanonske: readonly Resolved<KanonskaRow>[],
    lokacije: readonly Resolved<LokacijaRow>[],
    opservacije: readonly OpservacijaRow[],
    warnings: ImportWarnings,
  ): UsableRows {
    const kanonskiIds = new Set(kanonske.map((row) => row.kanonski_id));
    const locationIds = new Set(lokacije.map((row) => row.location_id));

    for (const row of lokacije) {
      if (row.kanonski_id !== null && !kanonskiIds.has(row.kanonski_id)) {
        warnings.add(
          `lokacija ${row.location_id}`,
          `kanonski_id "${row.kanonski_id}" is not in the canonical file, stored unlinked`,
        );
      }
    }

    const usableOpservacije = opservacije.filter((row) => {
      const hasLokacija = row.location_id !== null && locationIds.has(row.location_id);
      const hasKanonska = row.kanonski_id !== null && kanonskiIds.has(row.kanonski_id);

      if (!hasLokacija && !hasKanonska) {
        // With neither parent the row cannot be found again, which also means a
        // re-run could not replace it and would just add a second copy.
        warnings.add(
          `opservacija ${row.location_id ?? row.kanonski_id ?? '?'} (${row.godina})`,
          'neither location_id nor kanonski_id is in this import, row skipped',
        );
        return false;
      }

      return true;
    });

    return { kanonske, lokacije, opservacije: usableOpservacije };
  }

  private async write(
    rows: UsableRows,
    options: ImportOptions,
    context: {
      read: { kanonske: number; lokacije: number; opservacije: number };
      nerazresena: ReadonlyMap<string, number>;
      warnings: ImportWarnings;
    },
  ): Promise<ImportReport> {
    const run = async (repo: DeponijeImportRepository): Promise<ImportReport> => {
      const kanonskaIds = await repo.upsertKanonske(rows.kanonske);
      const lokacijaIds = await repo.upsertLokacije(rows.lokacije, kanonskaIds);

      const deleted = await repo.deleteOpservacijeFor(
        [...lokacijaIds.values()],
        [...kanonskaIds.values()],
      );
      const insertedOpservacije = await repo.insertOpservacije(
        rows.opservacije,
        lokacijaIds,
        kanonskaIds,
      );

      return {
        dryRun: options.dryRun,
        kanonske: counts(context.read.kanonske, kanonskaIds.size),
        lokacije: counts(context.read.lokacije, lokacijaIds.size),
        opservacije: {
          ...counts(context.read.opservacije, insertedOpservacije),
          deleted,
        },
        nerazresenaNaselja: [...context.nerazresena.entries()]
          .map(([naziv, redova]) => ({ naziv, redova }))
          .sort((a, b) => b.redova - a.redova || a.naziv.localeCompare(b.naziv)),
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

    // Unreachable: the callback above always throws.
    throw new Error('dry run did not roll back');
  }
}

interface UsableRows {
  kanonske: readonly Resolved<KanonskaRow>[];
  lokacije: readonly Resolved<LokacijaRow>[];
  opservacije: readonly OpservacijaRow[];
}

function counts(read: number, written: number): TableCounts {
  return { read, written, skipped: read - written };
}
