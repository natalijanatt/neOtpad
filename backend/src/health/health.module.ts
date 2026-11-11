import { Module } from '@nestjs/common';
import { DatabaseHealth } from '../database/database.health';
import { HealthController } from './health.controller';

@Module({
  // DatabaseModule is @Global, so the DATABASE token DatabaseHealth injects is
  // already in scope; only the probe itself needs declaring here.
  providers: [DatabaseHealth],
  controllers: [HealthController],
})
export class HealthModule {}
