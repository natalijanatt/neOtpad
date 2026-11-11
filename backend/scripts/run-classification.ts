/**
 * Drains the classification queue once, from the command line.
 *
 *   npm run classify:run              # one batch
 *   npm run classify:run -- --sve     # keep going until the queue is empty
 *
 * The same service the worker uses. It exists because a demo wants the queue
 * emptied now rather than on the next 15-second tick, and because seeing the
 * proposals on stdout is how the prompt gets judged against real reports.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ClassificationService, type ObradaRezultat } from '../src/classification/classification.service';

interface Args {
  sve: boolean;
  batch: number;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { sve: false, batch: 10 };

  for (const arg of argv) {
    if (arg === '--sve') {
      args.sve = true;
      continue;
    }
    const batch = /^--batch=(\d+)$/.exec(arg);
    if (batch) {
      args.batch = Number(batch[1]);
      continue;
    }
    throw new Error(`Unknown argument "${arg}"`);
  }

  if (args.batch < 1 || args.batch > 50) throw new Error('--batch must be between 1 and 50');
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const classification = app.get(ClassificationService);
    const ukupno: ObradaRezultat = { obradjeno: 0, uspesno: 0, odlozeno: 0, zastarelo: 0, neuspesno: 0 };

    // A deferred row is still pending, so "until empty" has to stop when a pass
    // resolves nothing at all - otherwise a report the model keeps refusing
    // would spin here until its attempts run out.
    for (;;) {
      const prolaz = await classification.obradiRed(args.batch);
      ukupno.obradjeno += prolaz.obradjeno;
      ukupno.uspesno += prolaz.uspesno;
      ukupno.odlozeno += prolaz.odlozeno;
      ukupno.zastarelo += prolaz.zastarelo;
      ukupno.neuspesno += prolaz.neuspesno;
      if (!args.sve || prolaz.obradjeno === 0 || prolaz.uspesno + prolaz.zastarelo + prolaz.neuspesno === 0) break;
    }

    console.log(
      [
        '',
        args.sve ? 'Classification run: until the queue stops resolving.' : 'Classification run: one batch.',
        '',
        `  reports claimed     ${ukupno.obradjeno}`,
        `  classified          ${ukupno.uspesno}`,
        `  deferred for retry  ${ukupno.odlozeno}`,
        `  stale, skipped      ${ukupno.zastarelo}`,
        `  failed              ${ukupno.neuspesno}`,
        '',
        ukupno.obradjeno === 0 ? 'Nothing was waiting.' : 'Proposals are advisory; the dispatcher still confirms each report.',
        '',
      ].join('\n'),
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(`Classification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
