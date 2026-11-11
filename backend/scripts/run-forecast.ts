/**
 * Runs the fill forecast once, from the command line.
 *
 *   npm run forecast:run              # only what is stale
 *   npm run forecast:run -- --sve     # the whole sensored fleet
 *
 * This is the same service the nightly `ForecastRunner` and route planning use.
 * It exists because a demo starts with `npm run db:reset`, which regenerates the
 * reading history and leaves `prognoza_punjenja` empty — and because seeing the
 * numbers on stdout is how the model gets sanity-checked against the data.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ForecastingService, type IzracunRezultat } from '../src/forecasting/forecasting.service';

interface Args {
  sve: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { sve: false };

  for (const arg of argv) {
    if (arg === '--sve') {
      args.sve = true;
      continue;
    }
    throw new Error(`Unknown argument "${arg}"`);
  }

  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const forecasting = app.get(ForecastingService);
    const rezultat = args.sve ? await forecasting.osveziSve() : await forecasting.osveziZastarele();
    printReport(rezultat, args);
  } finally {
    await app.close();
  }
}

function printReport(rezultat: IzracunRezultat, args: Args): void {
  console.log(
    [
      '',
      args.sve ? 'Forecast run: whole sensored fleet.' : 'Forecast run: stale forecasts only.',
      '',
      `  containers considered   ${rezultat.razmatrano}`,
      `  forecasts written       ${rezultat.upisano}`,
      `  critical within 48 h    ${rezultat.kriticnoU48h}`,
      '',
      // A container considered but not written has nothing to forecast from —
      // too little history for a slope. Saying so beats a silent difference.
      rezultat.razmatrano > rezultat.upisano
        ? `${rezultat.razmatrano - rezultat.upisano} container(s) had too little history for a curve.`
        : 'Every container considered got a curve.',
      '',
    ].join('\n'),
  );
}

void main().catch((error: unknown) => {
  console.error(`Forecast failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
