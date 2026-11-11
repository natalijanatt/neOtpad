/**
 * Whether the current state of a container may be read as a measurement.
 *
 * Mirrors the generated `ocitavanje.pouzdano` column, applied to
 * `kontejner_stanje`: a diagnostic code outranks the number beside it
 * (`docs/sensor-telemetry.md`), and a silent device has no current state at all.
 *
 * Shared because two features now depend on it meaning the same thing: routing
 * refuses to score an unreliable reading, and report classification refuses to
 * tell the model "this bin is 12 % full" when the sensor is reporting a blocked
 * optic. A missing reading is a gap, never a reassuring 0 %.
 */
export function pouzdanoOcitavanje(aktivniStatus: string[] | null, tihOd: Date | null): boolean {
  if (tihOd !== null) return false;
  if (aktivniStatus === null) return true;
  return aktivniStatus.length === 0 || (aktivniStatus.length === 1 && aktivniStatus[0] === 'ok');
}
