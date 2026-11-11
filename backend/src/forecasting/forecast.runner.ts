import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { isServingApi } from '../common/process-role';
import { ForecastingService } from './forecasting.service';

/**
 * The nightly forecast run (`docs/backend-architecture.md`, scheduled work).
 *
 * 02:00 Belgrade, ahead of the 04:00 route planning that reads what it wrote.
 * Route planning also refreshes anything stale on its own, so a missed night
 * degrades to a slower first plan rather than to yesterday's forecasts.
 *
 * Known limitation: this is an in-process timer, so two API instances would
 * both run it. One instance is what is deployed; when that changes the run
 * needs an advisory lock, not a second cron.
 */
@Injectable()
export class ForecastRunner {
  private readonly logger = new Logger(ForecastRunner.name);

  constructor(private readonly forecasting: ForecastingService, private readonly config: ConfigService) {}

  @Cron('0 2 * * *', { name: 'forecast', timeZone: 'Europe/Belgrade' })
  async nocno(): Promise<void> {
    // Same gate as the classification worker. Latent rather than observed here
    // - a script has to still be running at 02:00 - but it is the same bug.
    if (!isServingApi()) return;
    if (this.config.get<boolean>('FORECAST_CRON_ENABLED') === false) return;

    try {
      await this.forecasting.osveziSve();
    } catch (error) {
      // A failed forecast must not take the API down with it: the next route
      // plan will recompute what is stale anyway.
      this.logger.error(`nightly forecast failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
