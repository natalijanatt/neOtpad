import { Logger } from '@nestjs/common';
import { waitUntil } from '@vercel/functions';

const logger = new Logger('Background');

/**
 * Work that has to outlive the response.
 *
 * The promise is already running by the time it arrives here — starting it is
 * what the caller did. What differs between deployments is whether the process
 * survives long enough for it to finish. `npm run start:dev`, a container or
 * any long-lived server simply stays up and a floating promise completes. A
 * Vercel instance is frozen the moment the response is flushed, and a promise
 * nobody declared is suspended there, often for good: that is precisely why the
 * classification queue sat untouched in production while it drained fine
 * locally.
 *
 * `waitUntil` hands the promise to the platform, which keeps the function alive
 * until it settles. Off Vercel there is no request context, so the call is a
 * no-op (`@vercel/functions` reads `globalThis[Symbol.for('@vercel/request-context')]`
 * and falls back to `{}`) — which is exactly right, because there the floating
 * promise was never in danger.
 *
 * The catch is not optional. An unhandled rejection takes the whole process
 * down, and work that runs after the response is best-effort by definition: the
 * caller already got their answer and there is nobody left to tell.
 */
export function runInBackground(work: Promise<unknown>, what: string): void {
  waitUntil(work.catch((error: unknown) => {
    logger.error(`${what}: ${error instanceof Error ? error.message : String(error)}`);
  }));
}
