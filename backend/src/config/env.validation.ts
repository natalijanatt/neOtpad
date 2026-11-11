import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, Max, Min, MinLength, validateSync } from 'class-validator';

/**
 * The disposal-search model, chosen by a one-off accuracy test recorded in
 * docs/disposal-search.md.
 */
export const DEFAULT_OPENAI_MODEL = 'gpt-5.6-luna';

/**
 * Environment contract for the API.
 *
 * Validated at boot and not once afterwards: a missing DATABASE_URL should stop
 * the process on startup, not surface as a connection error during a demo
 * (devops-use-config-module).
 */
export class EnvVars {
  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  @IsInt()
  @Min(0)
  @Max(5)
  TRUST_PROXY_HOPS: number = 0;

  /**
   * Postgres connection string. Locally this is what `supabase status` prints as
   * "DB URL"; in the cloud it is the project's connection string. The API
   * connects as the owner of the `app` schema — the anon and service_role keys
   * are deliberately unused, because Supabase is a database here and nothing more.
   */
  @IsUrl({ protocols: ['postgres', 'postgresql'], require_tld: false })
  DATABASE_URL!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  NODE_ENV: string = 'development';

  /**
   * Supabase Storage over the S3 protocol — the one place this project uses
   * Supabase for something other than Postgres.
   *
   * The exception is narrow on purpose: these credentials are server-side only,
   * bytes travel through the API, and no browser ever holds a storage key. The
   * frontend still sees nothing but the generated contract.
   */
  @IsUrl({ protocols: ['https'], require_tld: false })
  STORAGE_S3_ENDPOINT!: string;

  @IsString()
  @MinLength(1)
  STORAGE_S3_REGION!: string;

  @IsString()
  @MinLength(1)
  STORAGE_S3_ACCESS_KEY_ID!: string;

  @IsString()
  @MinLength(1)
  STORAGE_S3_SECRET_ACCESS_KEY!: string;

  /** Bucket id exactly as Supabase stores it, spaces and capitals included. */
  @IsString()
  @MinLength(1)
  STORAGE_BUCKET!: string;

  /** Public object prefix; the bucket segment is appended and encoded by the storage service. */
  @IsUrl({ protocols: ['https'], require_tld: false })
  STORAGE_PUBLIC_BASE_URL!: string;

  /**
   * Upload ceiling. A phone photo is 2-5 MB; 8 MiB leaves room without letting a
   * single request hold an arbitrary buffer in memory.
   */
  @IsInt()
  @Min(1024)
  @Max(33554432)
  STORAGE_MAX_BYTES: number = 8388608;

  /**
   * The nightly fill forecast (02:00 Belgrade). On by default; turned off for a
   * second instance, or wherever a background job writing to the database is
   * not wanted. Route planning still refreshes stale forecasts on demand, so
   * disabling this degrades freshness rather than the feature.
   *
   * Transformed by hand: `enableImplicitConversion` would read the string
   * "false" as a truthy value and quietly leave the job running.
   */
  @Transform(({ value }) => (value === undefined ? true : value === true || value === 'true' || value === '1'))
  @IsBoolean()
  FORECAST_CRON_ENABLED: boolean = true;

  /**
   * One key, two consumers: the disposal search (docs/disposal-search.md) and
   * report triage (docs/report-classification.md).
   *
   * Optional on purpose. Without it both fall back to keyword matching, so a
   * fresh clone, CI and contract generation all run with no OpenAI account —
   * and no bill. Contract generation has neither a database nor a network.
   */
  // `@IsOptional` skips only undefined and null, and a .env file can express
  // neither: `OPENAI_API_KEY=` is an empty string, which is a value, which then
  // fails MinLength and stops the API from booting. Since .env.example ships
  // that exact line, an unset key has to mean the same thing as an absent one.
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MinLength(20)
  OPENAI_API_KEY?: string;

  /** Which model answers the disposal search. A new one should be checked against the phrases in docs/disposal-search.md first. */
  @IsString()
  @MinLength(1)
  OPENAI_MODEL: string = DEFAULT_OPENAI_MODEL;

  /**
   * Override for an Azure deployment, a gateway or a local mock. The trailing
   * slash is stripped because the report classifier appends
   * `/chat/completions`, and `https://host/v1/` would ask for
   * `//chat/completions`. The disposal search posts to the public endpoint
   * directly and does not read this.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\/+$/, '') : value))
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  OPENAI_BASE_URL: string = 'https://api.openai.com/v1';

  /**
   * Which model classifies reports. Separate from OPENAI_MODEL, and not
   * defaulted to it: the two tasks are not the same question, and this default
   * is the one report classification was actually verified against. It also has
   * to accept `temperature: 0`, which the disposal-search model does not.
   */
  @IsString()
  @MinLength(1)
  CLASSIFIER_MODEL: string = 'gpt-4o-mini';

  /** A hung call costs one attempt, not the queue behind it. */
  @IsInt()
  @Min(1000)
  @Max(120000)
  CLASSIFY_TIMEOUT_MS: number = 20000;

  /**
   * Attempts before a report is classified by the rules instead. Counted on
   * claim, so a process that dies mid-call still burns one.
   */
  @IsInt()
  @Min(1)
  @Max(10)
  CLASSIFY_MAX_ATTEMPTS: number = 3;

  @IsInt()
  @Min(1)
  @Max(50)
  CLASSIFY_BATCH: number = 5;

  /**
   * How many reports the post-submission drain takes (`ClassificationDrainInterceptor`).
   *
   * One by default: a submission enqueues exactly one row, and this work runs
   * after the response inside a serverless function's remaining lifetime. A
   * batch that cannot finish before the platform kills the function burns an
   * attempt per unfinished report, so this stays well under CLASSIFY_BATCH,
   * which the timer-driven worker uses on a server that has all the time it
   * needs.
   */
  @IsInt()
  @Min(1)
  @Max(10)
  CLASSIFY_DRAIN_BATCH: number = 1;

  /**
   * Same reasoning as FORECAST_CRON_ENABLED: off for a second instance, or
   * where no background writer is wanted. Gates both drainers — the timer and
   * the post-submission one — so turning it off really does stop automatic
   * classification rather than moving it.
   */
  @Transform(({ value }) => (value === undefined ? true : value === true || value === 'true' || value === '1'))
  @IsBoolean()
  CLASSIFY_WORKER_ENABLED: boolean = true;

  /**
   * Send report photographs to the model. On by default because the photo is
   * usually the deciding evidence; off for a deployment that will not send
   * images of public space to a third party (`docs/media-storage.md`).
   */
  @Transform(({ value }) => (value === undefined ? true : value === true || value === 'true' || value === '1'))
  @IsBoolean()
  CLASSIFY_USE_PHOTOS: boolean = true;
}

export function validateEnv(raw: Record<string, unknown>): EnvVars {
  const parsed = plainToInstance(EnvVars, raw, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(parsed, { skipMissingProperties: false });

  if (errors.length > 0) {
    // Listing every offending key at once, because fixing a .env one variable
    // per restart is the slowest possible way to learn what is missing.
    const detail = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n  ');
    throw new Error(`Invalid environment:\n  ${detail}`);
  }

  return parsed;
}
