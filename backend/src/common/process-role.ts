/**
 * Is this process the API, or a command-line entry point that happens to boot
 * the same module?
 *
 * Background jobs need the difference. `@Cron('0 2 * * *')` hid it — a script
 * is long gone by 02:00 — but `@Interval` does not: a 15-second timer fires
 * inside `import:deponije`, `forecast:run` or an integration run the moment
 * that process lives past its first tick, and the classification worker then
 * starts calling an external API against whatever `DATABASE_URL` points at.
 *
 * Set in one place (`main.ts`) rather than cleared in each of the seven
 * scripts, and defaulting to "not the API": forgetting to opt in costs a job
 * that does not run, while forgetting to opt out costs work nobody asked for.
 */
let servingApi = false;

/** Called by `main.ts` only. Nothing else may claim to be the API. */
export function markServingApi(): void {
  servingApi = true;
}

export function isServingApi(): boolean {
  return servingApi;
}
