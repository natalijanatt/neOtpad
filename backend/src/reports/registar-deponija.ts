import type { AppGeoPreciznost, AppPreciznostLokacije } from '../database/generated/schema';
import type { Tacka } from '../common/geo';

/**
 * A confirmed report translated into the shape the dump register stores.
 *
 * Kept out of the service and the repository for the same reason
 * `response-rules.ts` is: these are decisions about what the data means, they are
 * the ones a reviewer has to check, and they need no database to test.
 *
 * Read with `docs/data-sources.md`, which owns the boundary between the CSV
 * import and this path.
 */

/** Only reports of this type register a dump. The rest are container problems. */
export const TIP_DEPONIJE = 'divlja_deponija';

/**
 * What the register may claim about where a dump is, given what the report knew.
 *
 * `registarska_tacka` is reserved for a surveyed registry point and is never
 * produced here. A citizen's GPS fix is not surveyed, and neither is a pin a
 * dispatcher drops from a description, so both land on `geokodirano`; the report
 * keeps the finer distinction in its own `preciznost_lokacije`.
 *
 * An SMS report carries no coordinate at all, and that one becomes `nepoznato`
 * with no point rather than the centroid of its settlement, because a
 * substituted centroid is indistinguishable from a real location once it is in
 * the table (`docs/data-sources.md`). The table's own CHECK ties precision and
 * point together, so this function and that constraint have to agree.
 */
export function preciznostZaRegistar(tacka: Tacka | null): AppGeoPreciznost {
  return tacka === null ? 'nepoznato' : 'geokodirano';
}

export interface PrijavaZaRegistar {
  kratki_kod: string;
  naselje_id: string | null;
  tacka: Tacka | null;
  preciznost_lokacije: AppPreciznostLokacije;
}

/**
 * A canonical site first observed by a report.
 *
 * `naziv` is built from the short code alone. The citizen's own text is known to
 * carry names, house numbers and plate numbers — the classifier's prompt already
 * forbids copying it — and `GET /dumps` is a public endpoint.
 *
 * `broj_izvornih_redova` and `broj_opservacija` are left at zero on purpose:
 * both count what the CSV import owns, it overwrites them on every run, and a
 * number this path incremented would be silently reset. The count of citizen
 * observations is read with a join instead.
 */
export function kanonskaIzPrijave(prijava: PrijavaZaRegistar, godina: number) {
  const geo_preciznost = preciznostZaRegistar(prijava.tacka);

  return {
    naziv: `Prijava ${prijava.kratki_kod}`,
    naselje_id: prijava.naselje_id,
    tacka: prijava.tacka,
    geo_preciznost,
    prvi_put_zabelezena: godina,
    poslednji_put_zabelezena: godina,
    godine_evidentirana: [godina],
    izvori: ['PRIJAVA'],
    broj_izvornih_redova: 0,
    broj_opservacija: 0,
    ponovo_se_stvara: 'nepoznato' as const,
    // Read by `DeponijeRepository`'s STANJE as `prijavljeno`, which keeps the
    // site on the default map. A dump nobody has been to yet is still there.
    status: 'prijavljeno (prijava gradjana)',
  };
}

/**
 * The observation itself. `broj_deponija` stays 1: a report is one person
 * describing one spot, never the registry's "a dozen dumps near Izvor".
 */
export function opservacijaIzPrijave(
  prijava: PrijavaZaRegistar,
  tip_dogadjaja: 'prijava' | 'sanacija',
  datum: Date,
) {
  return {
    datum,
    godina: datum.getUTCFullYear(),
    tip_dogadjaja,
    tacka: prijava.tacka,
    broj_deponija: 1,
    izvor: 'PRIJAVA',
    izvor_url: null,
    opis: tip_dogadjaja === 'sanacija'
      ? `Prijava ${prijava.kratki_kod} zatvorena kao resena`
      : `Prijava ${prijava.kratki_kod} potvrdjena kao divlja deponija`,
  };
}
