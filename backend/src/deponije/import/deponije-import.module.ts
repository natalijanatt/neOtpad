import { Module } from '@nestjs/common';
import { DeponijeImportRepository } from './deponije-import.repository';
import { DeponijeImportService } from './deponije-import.service';

/**
 * The CSV import path for the historical dump datasets.
 *
 * No controller: the import is a command run against a checkout that has the
 * `waste-scraper/` files, not an endpoint. It lives in a module anyway so the
 * eventual `deponije` feature module can reuse the service instead of growing a
 * second copy of the mapping rules.
 */
@Module({
  providers: [DeponijeImportRepository, DeponijeImportService],
  exports: [DeponijeImportService],
})
export class DeponijeImportModule {}
