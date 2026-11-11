import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database } from '../database/database.module';
import type { AppGeoPreciznost, AppSubjekatRizika, Json } from '../database/generated/schema';
import type { BlackSpotQueryDto } from './dto/risk.dto';

/**
 * A black spot joined to the two things that make it readable: the settlement it
 * is in and the canonical dump it came from. The geography columns are selected
 * raw and decoded by `fromPoint`, not via `latLon`, because the same query has to
 * carry two points and a pair of `ST_X`/`ST_Y` aliases cannot be repeated.
 */
export interface CrnaTackaRedRow {
  id: string;
  naselje_id: string | null;
  naselje_naziv: string | null;
  kanonska_id: string | null;
  tacka: string | null;
  kanonska_tacka: string | null;
  kanonska_geo_preciznost: AppGeoPreciznost | null;
  prvi_put: Date | null;
  poslednji_put: Date | null;
  broj_ponavljanja: number;
  preporuka: string;
  obrazlozenje: string;
  status: string;
  sprovedeno_at: Date | null;
  rizik_skor: string | number | null;
  rizik_klasifikacija: string | null;
  rizik_komponente: Json | null;
  rizik_izracunato_at: Date | null;
  rizik_subjekat_tip: AppSubjekatRizika | null;
}

/**
 * Statuses that take a black spot off the open list. Anything else — including a
 * value this code has never seen — counts as open: a recommendation nobody can
 * classify must not disappear from the dispatcher's list on its own.
 */
const ZATVORENI_STATUSI = ['sprovedeno', 'odbaceno'];

@Injectable()
export class RiskRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async crneTacke(input: BlackSpotQueryDto): Promise<CrnaTackaRedRow[]> {
    let query = this.db
      .selectFrom('app.crna_tacka as ct')
      .leftJoin('app.naselje as n', 'n.id', 'ct.naselje_id')
      .leftJoin('app.deponija_kanonska as dk', 'dk.id', 'ct.kanonska_id')
      .leftJoinLateral(
        (eb) =>
          eb
            .selectFrom('app.rizik as r')
            .select(['r.skor', 'r.klasifikacija', 'r.komponente', 'r.izracunato_at', 'r.subjekat_tip'])
            // Scored through the canonical dump when there is one, otherwise
            // through the settlement — the fallback `routing` already applies to
            // a stop with no score of its own.
            .where(
              sql<boolean>`(r.subjekat_tip = 'kanonska_deponija' and r.subjekat_id = ct.kanonska_id)
                or (r.subjekat_tip = 'naselje' and r.subjekat_id = ct.naselje_id)`,
            )
            // A dump-level score outranks the settlement fallback even when the
            // settlement was rescored more recently.
            .orderBy(sql`r.subjekat_tip = 'kanonska_deponija' desc`)
            .orderBy('r.izracunato_at', 'desc')
            .limit(1)
            .as('rz'),
        (join) => join.onTrue(),
      )
      .select([
        'ct.id',
        'ct.naselje_id',
        'n.naziv as naselje_naziv',
        'ct.kanonska_id',
        'ct.tacka',
        'dk.tacka as kanonska_tacka',
        'dk.geo_preciznost as kanonska_geo_preciznost',
        'ct.prvi_put',
        'ct.poslednji_put',
        'ct.broj_ponavljanja',
        'ct.preporuka',
        'ct.obrazlozenje',
        'ct.status',
        'ct.sprovedeno_at',
        'rz.skor as rizik_skor',
        'rz.klasifikacija as rizik_klasifikacija',
        'rz.komponente as rizik_komponente',
        'rz.izracunato_at as rizik_izracunato_at',
        'rz.subjekat_tip as rizik_subjekat_tip',
      ]);

    if (input.sve !== true) query = query.where('ct.status', 'not in', ZATVORENI_STATUSI);
    if (input.naselje_id) query = query.where('ct.naselje_id', '=', input.naselje_id);
    if (input.preporuka) query = query.where('ct.preporuka', '=', input.preporuka);
    if (input.min_ponavljanja !== undefined) query = query.where('ct.broj_ponavljanja', '>=', input.min_ponavljanja);

    return query
      // Urgency order: the score first, then recurrence, then recency. An
      // unscored spot sorts last rather than first — no score is not a low one,
      // but it is also not evidence that the dispatcher should look here now.
      .orderBy(sql`rz.skor desc nulls last`)
      .orderBy('ct.broj_ponavljanja', 'desc')
      .orderBy(sql`ct.poslednji_put desc nulls last`)
      .orderBy('ct.id')
      .offset((input.page - 1) * input.limit)
      // One more than asked for: that extra row is the whole of `hasMore`.
      .limit(input.limit + 1)
      .execute() as Promise<CrnaTackaRedRow[]>;
  }
}
