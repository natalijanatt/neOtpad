import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';
import { LookupsController } from './lookups.controller';
import { LookupsRepository } from './lookups.repository';

@Module({
  imports: [AuthModule],
  controllers: [ReportsController, LookupsController],
  providers: [ReportsRepository, ReportsService, LookupsRepository],
})
export class ReportsModule {}
