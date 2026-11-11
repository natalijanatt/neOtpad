import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeponijeController } from './deponije.controller';
import { DeponijeRepository } from './deponije.repository';
import { DeponijeService } from './deponije.service';

/**
 * Read side of the dump register. The import that fills it lives in
 * `./import` and stays a separate, controller-free module: a CLI job and an HTTP
 * read have nothing to share but the tables.
 */
@Module({
  imports: [AuthModule],
  controllers: [DeponijeController],
  providers: [DeponijeRepository, DeponijeService],
  exports: [DeponijeService],
})
export class DeponijeModule {}
