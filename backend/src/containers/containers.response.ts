/**
 * Row → response mapping for the container views. Pure functions: the service
 * decides what to load, this file decides what a container looks like on the
 * wire, and neither knows about the other's dependencies.
 */
import { toNumberOrNull } from '../common/row-values';
import type {
  ContainerListItemDto,
  ContainerPrognozaDto,
  ContainerReadingDto,
  ContainerStanjeDto,
} from './dto/containers.dto';
import type { KontejnerRedRow, OcitavanjeRedRow } from './containers.repository';

const HOUR_MS = 3_600_000;

interface SerijaTacka {
  t: string;
  p50: number;
}

/**
 * Same rule as the `pouzdano` generated column on `ocitavanje`: any status other
 * than a bare `ok` is a device problem, and a silent device is a data gap. A
 * blocked sensor reads as a full container, so this flag is what stops the UI
 * from drawing that as a fill level.
 */
function pouzdanoStanje(row: KontejnerRedRow): boolean {
  if (row.tih_od !== null) return false;

  const status = row.aktivni_status ?? [];
  return status.length === 0 || (status.length === 1 && status[0] === 'ok');
}

function stanjeOf(row: KontejnerRedRow): ContainerStanjeDto {
  return {
    fill_percent: row.fill_percent,
    measured_at: row.measured_at === null ? null : row.measured_at.toISOString(),
    trend_pp_po_danu: toNumberOrNull(row.trend_pp_po_danu),
    baterija_percent: row.baterija_percent,
    aktivni_status: row.aktivni_status ?? [],
    tih_od: row.tih_od === null ? null : row.tih_od.toISOString(),
    pouzdano: pouzdanoStanje(row),
  };
}

/**
 * The level the curve expects after `sati` hours, read off the stored series.
 * The series is on a six-hour grid, so the value is interpolated between the two
 * surrounding points rather than snapped to the nearer one.
 */
function nivoPosle(serija: SerijaTacka[], odKad: number, sati: number): number | null {
  const cilj = odKad + sati * HOUR_MS;
  let pre: SerijaTacka | null = null;

  for (const tacka of serija) {
    const t = Date.parse(tacka.t);
    if (Number.isNaN(t)) continue;
    if (t === cilj) return tacka.p50;
    if (t < cilj) {
      pre = tacka;
      continue;
    }
    if (pre === null) return tacka.p50;

    const t0 = Date.parse(pre.t);
    const udeo = (cilj - t0) / (t - t0);
    return Math.round((pre.p50 + (tacka.p50 - pre.p50) * udeo) * 10) / 10;
  }

  // Past the end of the horizon there is nothing to read; saying so beats
  // extrapolating a curve the model did not draw.
  return null;
}

function prognozaOf(row: KontejnerRedRow, sada: Date): ContainerPrognozaDto | undefined {
  if (row.prognoza_izracunata_at === null || row.prognoza_ulazni_podaci_do === null) return undefined;

  const serija = Array.isArray(row.prognoza_serija) ? (row.prognoza_serija as unknown as SerijaTacka[]) : [];
  const odKad = row.prognoza_izracunata_at.getTime();

  return {
    vreme_kriticnog: row.prognoza_vreme_kriticnog === null ? null : row.prognoza_vreme_kriticnog.toISOString(),
    sati_do_kriticnog:
      row.prognoza_vreme_kriticnog === null
        ? null
        : Math.round(((row.prognoza_vreme_kriticnog.getTime() - sada.getTime()) / HOUR_MS) * 10) / 10,
    // Measured from when the forecast was computed, not from now: that is the
    // instant its first point describes, and shifting it would invent precision.
    ocekivano_24h: nivoPosle(serija, odKad, 24),
    ocekivano_48h: nivoPosle(serija, odKad, 48),
    pouzdanost: row.prognoza_pouzdanost ?? 'niska',
    ima_rupu: row.prognoza_ima_rupu ?? false,
    izracunata_at: row.prognoza_izracunata_at.toISOString(),
    ulazni_podaci_do: row.prognoza_ulazni_podaci_do.toISOString(),
  };
}

/**
 * Without `sa_stanjem` the item is the reference shape the report wizard has
 * always received: an identifier, a label and a settlement. Everything else is
 * opt-in, so filing a report does not download the fleet's telemetry.
 */
export function toListItem(row: KontejnerRedRow, saStanjem: boolean, sada: Date): ContainerListItemDto {
  const osnovno: ContainerListItemDto = { id: row.id, naziv: row.oznaka, naselje_id: row.naselje_id };
  if (!saStanjem) return osnovno;

  return {
    ...osnovno,
    sabirno_mesto_id: row.sabirno_mesto_id,
    mesto_naziv: row.mesto_naziv,
    tip_otpada: row.tip_otpada,
    zapremina_l: row.zapremina_l,
    lokacija: { lat: row.lat, lon: row.lon },
    ima_senzor: row.ima_senzor,
    poslednje_praznjenje: row.poslednje_praznjenje === null ? null : row.poslednje_praznjenje.toISOString(),
    prelivanja_90d: Number(row.prelivanja_90d ?? 0),
    stanje: stanjeOf(row),
    prognoza: prognozaOf(row, sada),
  };
}

export function toReading(row: OcitavanjeRedRow): ContainerReadingDto {
  return {
    measured_at: row.measured_at.toISOString(),
    fill_percent: row.fill_percent_izracunat,
    pouzdano: row.pouzdano ?? false,
    orientation: row.orientation,
    baterija_percent: row.battery_percent,
  };
}
