import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { validateEnv } from './config/env.validation';
import { ClassificationModule } from './classification/classification.module';
import { ContainersModule } from './containers/containers.module';
import { DatabaseModule } from './database/database.module';
import { DeponijeModule } from './deponije/deponije.module';
import { DeponijeImportModule } from './deponije/import/deponije-import.module';
import { ForecastingModule } from './forecasting/forecasting.module';
import { NaseljaImportModule } from './geo/import/naselja-import.module';
import { HealthModule } from './health/health.module';
import { RoutingModule } from './routing/routing.module';
import { AuthModule } from './auth/auth.module';
import { DisposalModule } from './disposal/disposal.module';
import { NewsModule } from './news/news.module';
import { ReportsModule } from './reports/reports.module';
import { RiskModule } from './risk/risk.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // Deployed environments inject real variables; a stray .env on the server
      // silently overriding them is a debugging session nobody enjoys.
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),
    DatabaseModule,
    StorageModule,
    // Timers for the background jobs. Registering the module is NOT by itself
    // harmless in a CLI script: a nightly cron is long gone by 02:00, but the
    // classification worker runs on a 15-second interval and fires inside any
    // script that lives that long. Both runners therefore check
    // `common/process-role.ts` and do nothing outside the API process.
    ScheduleModule.forRoot(),
    // Both controller-free, so they add nothing to the generated contract; they
    // are here so the import commands can resolve their services out of the app.
    NaseljaImportModule,
    DeponijeImportModule,
    HealthModule,
    ContainersModule,
    ForecastingModule,
    RoutingModule,
    AuthModule,
    ReportsModule,
    ClassificationModule,
    NewsModule,
    DisposalModule,
    RiskModule,
    DeponijeModule,
  ],
})
export class AppModule {}
