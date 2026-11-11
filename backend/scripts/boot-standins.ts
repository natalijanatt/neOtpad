/**
 * Environment stand-ins for entry points that boot AppModule without the
 * infrastructure behind it.
 *
 * `EnvVars` validates at startup and providers resolve their configuration in
 * their constructors, both on purpose: a deployment missing a bucket or a
 * database should die immediately rather than on a citizen's first photograph.
 * The cost is that every entry point which boots the app has to supply
 * something for each required variable, even when it will never use it —
 * contract generation runs with no database, and the integration runner has no
 * object store.
 *
 * This list exists because those stand-ins used to be copied into each of those
 * entry points. Adding STORAGE_* to one and forgetting the other is what broke
 * CI: the contract job passed and every integration test died in
 * NestFactory.create. One list, imported by both, so a new required variable is
 * one edit and cannot be half-applied.
 *
 * Hosts are `.invalid` (RFC 2606), so anything that does try to reach them
 * fails loudly instead of writing somewhere real.
 */
export const BOOT_STANDINS: Record<string, string> = {
  DATABASE_URL: 'postgresql://boot-standin@127.0.0.1:5432/unused',
  JWT_SECRET: 'boot-standin-only-not-a-runtime-secret',
  STORAGE_S3_ENDPOINT: 'https://boot-standin.invalid/storage/v1/s3',
  STORAGE_S3_REGION: 'boot-standin',
  STORAGE_S3_ACCESS_KEY_ID: 'boot-standin',
  STORAGE_S3_SECRET_ACCESS_KEY: 'boot-standin',
  STORAGE_BUCKET: 'boot-standin',
  STORAGE_PUBLIC_BASE_URL: 'https://boot-standin.invalid/storage/v1/object/public',
};

/**
 * Fills in only what the caller has not set. Never overrides: the integration
 * runner supplies a real DATABASE_URL and a real JWT_SECRET, and those must win.
 */
export function applyBootStandins(env: NodeJS.ProcessEnv = process.env): void {
  for (const [key, value] of Object.entries(BOOT_STANDINS)) env[key] ??= value;
}
