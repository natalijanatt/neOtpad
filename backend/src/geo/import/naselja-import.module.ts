import { Module } from '@nestjs/common';
import { NaseljaImportRepository } from './naselja-import.repository';
import { NaseljaImportService } from './naselja-import.service';

/**
 * The settlement gazetteer import. Controller-free for the same reason as
 * `DeponijeImportModule`: it reads files from the checkout and rewrites reference
 * data wholesale, which is a command, not an endpoint.
 */
@Module({
  providers: [NaseljaImportRepository, NaseljaImportService],
  exports: [NaseljaImportService],
})
export class NaseljaImportModule {}
