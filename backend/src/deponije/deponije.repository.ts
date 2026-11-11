import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database } from '../database/database.module';
import type { AppGeoPreciznost, AppPouzdanostSpajanja, AppTrojstvo } from '../database/generated/schema';
import type { DumpQueryDto } from './dto/deponije.dto';

/**
 * `status` is verbatim source prose, often several clauses joined with `;`
 * ("aktivna (prijavljena i za 2024); evidentirana u LPUO 2021-2031"). The
 * leading clause is the one that states what the site is now, so the reduction
 * reads only that.
 *
 * In SQL rather than in the mapper because `sve=false` filters on the result,
 * and a predicate that disagreed with the field it filters on would be the worst
 * of both.
 */
const STANJE = sql<string>`case
  when dk.status ilike 'u sanaciji%'  then 'u_sanaciji'
  when dk.status ilike 'ocisceno%'    then 'ocisceno'
  when dk.status ilike 'aktivna%'     then 'aktivna'
  when dk.status ilike 'prijavljeno%' then 'prijavljeno'
  else 'evidentirana'
end`;

/**
 * Still standing.
 *
 * Only clearing and remediation close a site. Absence from later reports does
 * not: 2017 has no Pirot rows at all and the 2018 locations never reappear,
 * which is a change of reporting method rather than dumps disappearing
 * (`docs/data-sources.md`). So "nije prijavljena posle 2018" stays active.
 *
 * The second half is the LPUO's own finding — a cleared site refills unless a
 * container replaces it — so a clearing the sources already contradict does not
 * count as closure.
 */
const AKTIVNA = sql<boolean>`(${STANJE} not in ('ocisceno', 'u_sanaciji') or dk.ponovo_se_stvara = 'da')`;

/**
 * A canonical dump with the settlement name and the aggregates that live one
 * table down.
 *
 * `povrsina_m2`, `zapremina_m3`, `kolicina_t` and `ociscena_datum` are
 * deliberately not columns on `deponija_kanonska` (`deponije-csv.ts`): each is
 * the maximum or the pick of the source rows merged into the site, and those
 * rows keep their own provenance in `deponija_lokacija`. The same rule is applied
 * here on read, so the API cannot quietly invent a different aggregation.
 */
export interface DeponijaRedRow {
  id: string;
  kanonski_id: string;
  naziv: string | null;
  naselje_id: string | null;
  naselje_naziv: string | null;
  tacka: string | null;
  geo_preciznost: AppGeoPreciznost;
  prvi_put_zabelezena: number | null;
  poslednji_put_zabelezena: number | null;
  godine_evidentirana: number[];
  izvori: string[];
  broj_izvornih_redova: number;
  broj_opservacija: number;
  ponovo_se_stvara: AppTrojstvo;
  broj_prijava: number | string;
  poslednja_prijava_at: Date | string | null;
  status: string | null;
  stanje: string;
  aktivna: boolean;
  spajanje_pouzdanost: AppPouzdanostSpajanja | null;
  povrsina_m2: string | number | null;
  zapremina_m3: string | number | null;
  kolicina_t: string | number | null;
  ociscena_datum: Date | string | null;
}

@Injectable()
export class DeponijeRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async kanonske(input: DumpQueryDto): Promise<DeponijaRedRow[]> {
    let query = this.db
      .selectFrom('app.deponija_kanonska as dk')
      .leftJoin('app.naselje as n', 'n.id', 'dk.naselje_id')
      .leftJoinLateral(
        (eb) =>
          eb
            .selectFrom('app.deponija_lokacija as dl')
            .select((inner) => [
              inner.fn.max('dl.povrsina_m2').as('povrsina_m2'),
              inner.fn.max('dl.zapremina_m3').as('zapremina_m3'),
              inner.fn.max('dl.kolicina_t').as('kolicina_t'),
              inner.fn.max('dl.ociscena_datum').as('ociscena_datum'),
            ])
            .whereRef('dl.kanonska_id', '=', 'dk.id')
            .as('agg'),
        (join) => join.onTrue(),
      )
      // Counted here rather than folded into `broj_opservacija`: that column is
      // the import's property and it overwrites it from the CSV on every run, so
      // a citizen report added to it would be silently reset
      // (`docs/data-sources.md`).
      .leftJoinLateral(
        (eb) =>
          eb
            .selectFrom('app.deponija_opservacija as po')
            .select((inner) => [
              inner.fn.countAll<number>().as('broj_prijava'),
              inner.fn.max('po.datum').as('poslednja_prijava_at'),
            ])
            .whereRef('po.kanonska_id', '=', 'dk.id')
            .where('po.prijava_id', 'is not', null)
            .where('po.tip_dogadjaja', '=', 'prijava')
            .as('prijave'),
        (join) => join.onTrue(),
      )
      .select([
        'dk.id',
        'dk.kanonski_id',
        'dk.naziv',
        'dk.naselje_id',
        'n.naziv as naselje_naziv',
        'dk.tacka',
        'dk.geo_preciznost',
        'dk.prvi_put_zabelezena',
        'dk.poslednji_put_zabelezena',
        'dk.godine_evidentirana',
        'dk.izvori',
        'dk.broj_izvornih_redova',
        'dk.broj_opservacija',
        'dk.ponovo_se_stvara',
        'prijave.broj_prijava',
        'prijave.poslednja_prijava_at',
        'dk.status',
        STANJE.as('stanje'),
        AKTIVNA.as('aktivna'),
        'dk.spajanje_pouzdanost',
        'agg.povrsina_m2',
        'agg.zapremina_m3',
        'agg.kolicina_t',
        'agg.ociscena_datum',
      ]);

    // Default is what still stands; the whole register is opt-in.
    if (input.sve !== true) query = query.where(AKTIVNA);
    if (input.naselje_id) query = query.where('dk.naselje_id', '=', input.naselje_id);
    // The table's own constraint ties the two together, so filtering on the
    // precision is the same as filtering on the point — and says why.
    if (input.sa_lokacijom === true) query = query.where('dk.geo_preciznost', '!=', 'nepoznato');

    return query
      // `K-01`..`K-52` is zero-padded, so the register's own order is also the
      // lexical one.
      .orderBy('dk.kanonski_id')
      .offset((input.page - 1) * input.limit)
      // One more than asked for: that extra row is the whole of `hasMore`.
      .limit(input.limit + 1)
      .execute() as Promise<DeponijaRedRow[]>;
  }
}
