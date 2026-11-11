import type { SensorHealth, SensorStatusCode } from '@/domain/types';

export const SENSOR_STATUS_LABEL: Record<SensorStatusCode, string> = {
  ok: 'Senzor radi',
  optics_blocked: 'Zaprljana optika',
  low_battery: 'Slaba baterija',
  tipped: 'Prevrnut',
  silent: 'Nema signala',
};

/**
 * Zaprljana optika čita kao „puno“, tišina je rupa u podacima — ni jedno nije
 * merenje. Takva popunjenost se prikazuje, ali ne ulazi u prioritet ni u
 * brojače „kritično“ (docs/sensor-telemetry.md).
 */
export function isReadingTrusted(container: { sensor: SensorHealth | null }): boolean {
  return !container.sensor?.status.some((c) => c === 'optics_blocked' || c === 'silent');
}

/** Kod koji zahteva servis, ako postoji — za bedž u tabeli i detalju. */
export function sensorIssue(container: { sensor: SensorHealth | null; hasSensor: boolean }): SensorStatusCode | null {
  if (!container.hasSensor || !container.sensor) return null;
  return container.sensor.status.find((c) => c !== 'ok') ?? null;
}
