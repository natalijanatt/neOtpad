import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database } from '../database/database.module';
import type { Json } from '../database/generated/schema';

export interface SvezinaRow {
  kontejner_id: string;
  poslednje_ocitavanje: Date | null;
  poslednje_praznjenje: Date | null;
  izracunata_at: Date | null;
  ulazni_podaci_do: Date | null;
}

export interface OcitavanjeRow {
  kontejner_id: string;
  measured_at: Date;
  fill_percent_izracunat: number;
}

export interface PraznjenjeRow {
  kontejner_id: string;
  detektovano_at: Date;
}

export interface StanjeRow {
  kontejner_id: string;
  aktivni_status: string[];
  tih_od: Date | null;
}

export interface DogadjajRow {
  naselje_id: string | null;
  mesna_zajednica_id: string | null;
  datum_pocetka: Date;
  datum_kraja: Date;
  ocekivani_faktor: string | null;
}

export interface PripadnostRow {
  kontejner_id: string;
  naselje_id: string;
  mesna_zajednica_id: string | null;
}

export interface NovaPrognoza {
  kontejner_id: string;
  izracunata_at: Date;
  horizont_do: Date;
  ulazni_podaci_do: Date;
  serija: unknown;
  vreme_kriticnog: Date | null;
  ima_rupu: boolean;
  model_verzija: string;
  pouzdanost: string;
}

export interface PrognozaRow {
  id: string;
  kontejner_id: string;
  izracunata_at: Date;
  horizont_do: Date;
  ulazni_podaci_do: Date;
  serija: Json;
  vreme_kriticnog: Date | null;
  ima_rupu: boolean;
  model_verzija: string;
  pouzdanost: string;
}

@Injectable()
export class ForecastingRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * One row per container that currently carries a sensor, with the three
   * timestamps the freshness rule needs. Containers without a mounting are
   * absent on purpose: there is no history to forecast from, and routing's
   * `bez_senzora` term is what speaks for them.
   */
  async svezina(): Promise<SvezinaRow[]> {
    return this.db
      .selectFrom('app.kontejner as k')
      .innerJoin('app.uredjaj_montaza as m', (join) =>
        join.onRef('m.kontejner_id', '=', 'k.id').on('m.montiran_do', 'is', null),
      )
      .select((eb) => [
        'k.id as kontejner_id',
        eb
          .selectFrom('app.ocitavanje as o')
          .select((inner) => inner.fn.max('o.measured_at').as('v'))
          .whereRef('o.kontejner_id', '=', 'k.id')
          .where('o.pouzdano', '=', true)
          .as('poslednje_ocitavanje'),
        eb
          .selectFrom('app.praznjenje as p')
          .select((inner) => inner.fn.max('p.detektovano_at').as('v'))
          .whereRef('p.kontejner_id', '=', 'k.id')
          .as('poslednje_praznjenje'),
        eb
          .selectFrom('app.prognoza_punjenja as pr')
          .select('pr.izracunata_at')
          .whereRef('pr.kontejner_id', '=', 'k.id')
          .orderBy('pr.izracunata_at', 'desc')
          .limit(1)
          .as('izracunata_at'),
        eb
          .selectFrom('app.prognoza_punjenja as pr')
          .select('pr.ulazni_podaci_do')
          .whereRef('pr.kontejner_id', '=', 'k.id')
          .orderBy('pr.izracunata_at', 'desc')
          .limit(1)
          .as('ulazni_podaci_do'),
      ])
      .where('k.status', '=', 'aktivan')
      .where('k.uklonjen_datum', 'is', null)
      .execute() as Promise<SvezinaRow[]>;
  }

  /**
   * Readings that may enter a fit: reliable ones only, and only those carrying
   * the server-recomputed percentage. A reading with a fault code reads as a
   * full container (`docs/sensor-telemetry.md`) and must never shape a curve.
   */
  async ocitavanja(kontejnerIds: string[], od: Date): Promise<OcitavanjeRow[]> {
    if (kontejnerIds.length === 0) return [];

    return this.db
      .selectFrom('app.ocitavanje')
      .select(['kontejner_id', 'measured_at', 'fill_percent_izracunat'])
      .where('kontejner_id', 'in', kontejnerIds)
      .where('measured_at', '>=', od)
      .where('pouzdano', '=', true)
      .where('fill_percent_izracunat', 'is not', null)
      .orderBy('kontejner_id')
      .orderBy('measured_at')
      .execute() as Promise<OcitavanjeRow[]>;
  }

  async praznjenja(kontejnerIds: string[], od: Date): Promise<PraznjenjeRow[]> {
    if (kontejnerIds.length === 0) return [];

    return this.db
      .selectFrom('app.praznjenje')
      .select(['kontejner_id', 'detektovano_at'])
      .where('kontejner_id', 'in', kontejnerIds)
      .where('detektovano_at', '>=', od)
      .orderBy('kontejner_id')
      .orderBy('detektovano_at')
      .execute();
  }

  async stanja(kontejnerIds: string[]): Promise<StanjeRow[]> {
    if (kontejnerIds.length === 0) return [];

    return this.db
      .selectFrom('app.kontejner_stanje')
      .select(['kontejner_id', 'aktivni_status', 'tih_od'])
      .where('kontejner_id', 'in', kontejnerIds)
      .execute();
  }

  /** Which settlement and local community each container belongs to, for the calendar. */
  async pripadnost(kontejnerIds: string[]): Promise<PripadnostRow[]> {
    if (kontejnerIds.length === 0) return [];

    return this.db
      .selectFrom('app.kontejner as k')
      .innerJoin('app.sabirno_mesto as sm', 'sm.id', 'k.sabirno_mesto_id')
      .innerJoin('app.naselje as n', 'n.id', 'sm.naselje_id')
      .select(['k.id as kontejner_id', 'n.id as naselje_id', 'n.mesna_zajednica_id'])
      .where('k.id', 'in', kontejnerIds)
      .execute();
  }

  /**
   * Seasonality windows overlapping the horizon. `ponavljanje` (RRULE) is not
   * expanded yet — until the calendar is seeded there is nothing to expand, and
   * a half-implemented recurrence would silently drop the movable feasts it
   * exists for.
   */
  async dogadjaji(od: Date, doKad: Date): Promise<DogadjajRow[]> {
    return this.db
      .selectFrom('app.kalendarski_dogadjaj')
      .select(['naselje_id', 'mesna_zajednica_id', 'datum_pocetka', 'datum_kraja', 'ocekivani_faktor'])
      .where('ocekivani_faktor', 'is not', null)
      .where('datum_pocetka', '<=', doKad)
      .where('datum_kraja', '>=', od)
      .execute();
  }

  /** Forecasts are appended, never updated: yesterday's prediction is the accuracy metric. */
  async upisi(prognoze: NovaPrognoza[]): Promise<void> {
    if (prognoze.length === 0) return;

    await this.db
      .insertInto('app.prognoza_punjenja')
      .values(
        prognoze.map((p) => ({
          kontejner_id: p.kontejner_id,
          izracunata_at: p.izracunata_at,
          horizont_do: p.horizont_do,
          ulazni_podaci_do: p.ulazni_podaci_do,
          serija: sql<Json>`${JSON.stringify(p.serija)}::jsonb`,
          vreme_kriticnog: p.vreme_kriticnog,
          ima_rupu: p.ima_rupu,
          model_verzija: p.model_verzija,
          pouzdanost: p.pouzdanost,
        })),
      )
      .execute();
  }

  async poslednja(kontejnerId: string): Promise<PrognozaRow | undefined> {
    return this.db
      .selectFrom('app.prognoza_punjenja')
      .select([
        'id',
        'kontejner_id',
        'izracunata_at',
        'horizont_do',
        'ulazni_podaci_do',
        'serija',
        'vreme_kriticnog',
        'ima_rupu',
        'model_verzija',
        'pouzdanost',
      ])
      .where('kontejner_id', '=', kontejnerId)
      .orderBy('izracunata_at', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  /** Does this container exist at all — the 404 a missing forecast must not be confused with. */
  async postoji(kontejnerId: string): Promise<boolean> {
    const red = await this.db
      .selectFrom('app.kontejner')
      .select('id')
      .where('id', '=', kontejnerId)
      .executeTakeFirst();

    return red !== undefined;
  }
}
