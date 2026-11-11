import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ForecastRunner } from './forecast.runner';
import { ForecastingController } from './forecasting.controller';
import { ForecastingRepository } from './forecasting.repository';
import { ForecastingService } from './forecasting.service';

/**
 * Fill forecasting. Depends on nothing but the database: the module map has
 * forecasting downstream of telemetry and upstream of routing, so it reads the
 * reading history through its own repository and is imported by routing, never
 * the other way round.
 */
@Module({
  imports: [AuthModule],
  controllers: [ForecastingController],
  providers: [ForecastingRepository, ForecastingService, ForecastRunner],
  exports: [ForecastingService],
})
export class ForecastingModule {}
