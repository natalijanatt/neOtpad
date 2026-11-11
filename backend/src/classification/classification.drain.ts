import { Injectable, Logger, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { tap, type Observable } from 'rxjs';
import { runInBackground } from '../common/background';
import { ClassificationService } from './classification.service';

/**
 * The routes that put a row in the queue. `POST /reports` and its assisted twin
 * are the only two, because a queue row is only ever written by
 * `ReportsRepository.enqueueClassification` inside a submission's transaction.
 *
 * Listed as paths rather than by importing the controller: this module is a
 * leaf and stays one. The cost is that renaming a route silently stops the
 * drain, which is what `classification.drain.spec.ts` is guarding.
 */
const PUTANJE_KOJE_PUNE_RED = new Set(['/reports', '/reports/assisted']);

/**
 * Drains the classification queue right after a report is submitted.
 *
 * `ClassificationRunner`'s 15-second `@Interval` is the drainer on a long-lived
 * server, and it does nothing at all on Vercel: the instance is frozen between
 * requests, so a timer that is not inside a request never gets to run. This
 * interceptor is the serverless answer — the work starts once the handler has
 * returned (so the submission's transaction has committed and the queue row is
 * visible) and is handed to `waitUntil`, which keeps the function alive until
 * it finishes. The citizen's response is never awaited on it.
 *
 * One report per request by default (`CLASSIFY_DRAIN_BATCH`). A submission
 * enqueues exactly one row, so one is the natural rate, and it keeps the
 * background work inside the function's duration limit — a model call killed
 * halfway costs an attempt (`CLASSIFY_MAX_ATTEMPTS`), so a batch that cannot
 * finish would quietly spend a report's retry budget. A backlog drains over the
 * submissions that follow, and `npm run classify:run` still empties it by hand.
 *
 * Deliberately not registered as a route-level decorator on the reports
 * controller: that would make `reports` import this module, and the outbox
 * exists so the two never have to know about each other.
 */
@Injectable()
export class ClassificationDrainInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ClassificationDrainInterceptor.name);

  constructor(private readonly classification: ClassificationService, private readonly config: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Non-HTTP contexts have no request; the guard also keeps this cheap for
    // every other route, since it is registered globally.
    const http = context.switchToHttp();
    const request = http.getRequest<Request | undefined>();
    const puniRed = request?.method === 'POST' && PUTANJE_KOJE_PUNE_RED.has(request.path);

    // `tap`'s next channel only fires when the handler succeeded. A rejected
    // submission rolled its queue row back with everything else, so there is
    // nothing to drain.
    return next.handle().pipe(tap({ next: () => { if (puniRed) this.drain(); } }));
  }

  private drain(): void {
    if (this.config.get<boolean>('CLASSIFY_WORKER_ENABLED') === false) return;

    const batch = this.config.get<number>('CLASSIFY_DRAIN_BATCH', 1);
    runInBackground(
      this.classification.obradiRed(batch).then((rezultat) => {
        if (rezultat.obradjeno > 0) {
          this.logger.log(`klasifikacija: ${rezultat.uspesno} uspesno, ${rezultat.odlozeno} odlozeno, ${rezultat.zastarelo} zastarelo, ${rezultat.neuspesno} neuspesno`);
        }
      }),
      'drain after submission',
    );
  }
}
