/**
 * Row → model for forecasting. Pure functions, no dependencies, same rule as
 * every other mapper in the codebase.
 */
import { toInstant, toInstantOrNull, toNumber } from '../common/row-values';
import type { Prognoza, Svezina } from './forecasting.model';
import type { DogadjajRow, PrognozaRow, StanjeRow, SvezinaRow } from './forecasting.repository';
import type { KalendarskiFaktor, Pouzdanost, SerijaTacka } from './model/fill-model';

const POUZDANOSTI: readonly Pouzdanost[] = ['visoka', 'srednja', 'niska'];

/**
 * `pouzdanost` is a free-text column, so a value the model never writes is
 * possible in principle. It is read back as the most cautious one rather than
 * widening the model's type: an unknown label is not a reason to look confident.
 */
function toPouzdanost(value: string): Pouzdanost {
  return (POUZDANOSTI as readonly string[]).includes(value) ? (value as Pouzdanost) : 'niska';
}

export function toPrognoza(row: PrognozaRow): Prognoza {
  return {
    id: row.id,
    kontejner_id: row.kontejner_id,
    izracunata_at: toInstant(row.izracunata_at),
    horizont_do: toInstant(row.horizont_do),
    ulazni_podaci_do: toInstant(row.ulazni_podaci_do),
    serija: (row.serija ?? []) as unknown as SerijaTacka[],
    vreme_kriticnog: toInstantOrNull(row.vreme_kriticnog),
    ima_rupu: row.ima_rupu,
    model_verzija: row.model_verzija,
    pouzdanost: toPouzdanost(row.pouzdanost),
  };
}

export function toSvezina(row: SvezinaRow): Svezina {
  return {
    kontejner_id: row.kontejner_id,
    poslednje_ocitavanje: toInstantOrNull(row.poslednje_ocitavanje),
    poslednje_praznjenje: toInstantOrNull(row.poslednje_praznjenje),
    izracunata_at: toInstantOrNull(row.izracunata_at),
    ulazni_podaci_do: toInstantOrNull(row.ulazni_podaci_do),
  };
}

/**
 * Is the container's cached state trustworthy? Same rule as the `pouzdano`
 * generated column on `ocitavanje`: any status other than a bare `ok` is a
 * device problem, and a silent device is a data gap rather than a measurement.
 */
export function stanjePouzdano(row: StanjeRow | undefined): boolean {
  if (row === undefined) return false;
  if (row.tih_od !== null) return false;

  const status = row.aktivni_status ?? [];
  return status.length === 0 || (status.length === 1 && status[0] === 'ok');
}

/**
 * A calendar row as a factor window. `date` columns arrive as local midnight, so
 * the window ends at the end of `datum_kraja` — an event on its last day is
 * still in effect that evening.
 */
export function toFaktor(row: DogadjajRow): KalendarskiFaktor {
  const od = toInstant(row.datum_pocetka);
  const kraj = toInstant(row.datum_kraja);

  return {
    od,
    do: new Date(kraj.getTime() + 86_400_000 - 1),
    faktor: toNumber(row.ocekivani_faktor ?? '1'),
  };
}
