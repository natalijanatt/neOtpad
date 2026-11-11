import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { isServingApi } from '../common/process-role';
import { ClassificationService } from './classification.service';

/**
 * The queue worker.
 *
 * Classification is deliberately not inline in `POST /reports`: an anonymous
 * submission must not get slower, and must not fail, because an external API is
 * rate-limited or down. The report is written with its queue row in one
 * transaction and this picks it up seconds later, which is well inside the time
 * a dispatcher takes to open the queue.
 *
 * Same known limitation as `ForecastRunner`: an in-process timer, so two API
 * instances would both sweep. Unlike the forecast that is already safe here -
 * `preuzmi` claims rows with `for update skip locked`, so the second instance
 * takes different work rather than duplicating it.
 *
 * It runs only in the API process (`common/process-role.ts`). The comment in
 * `app.module.ts` about scheduled work being harmless in a CLI context was
 * written for a nightly cron and does not hold for an interval this short.
 */
@Injectable()
export class ClassificationRunner {
  private readonly logger = new Logger(ClassificationRunner.name);
  /** One sweep at a time: a slow model call must not have a second sweep stacked behind it. */
  private uToku = false;

  constructor(private readonly classification: ClassificationService, private readonly config: ConfigService) {}

  @Interval('klasifikacija', 15000)
  async sweep(): Promise<void> {
    // A CLI script boots the same module, and a 15-second timer fires inside it
    // long before the script exits. `npm run import:deponije` must not start
    // calling OpenAI because it happened to run for twenty seconds.
    if (!isServingApi()) return;
    if (this.config.get<boolean>('CLASSIFY_WORKER_ENABLED') === false) return;
    if (this.uToku) return;

    this.uToku = true;
    try {
      const rezultat = await this.classification.obradiRed(this.config.get<number>('CLASSIFY_BATCH', 5));
      if (rezultat.obradjeno > 0) {
        this.logger.log(`klasifikacija: ${rezultat.uspesno} uspesno, ${rezultat.odlozeno} odlozeno, ${rezultat.zastarelo} zastarelo, ${rezultat.neuspesno} neuspesno`);
      }
    } catch (error) {
      // A failed sweep must not take the API down: the rows stay pending and the
      // next tick retries them.
      this.logger.error(`sweep failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.uToku = false;
    }
  }
}
