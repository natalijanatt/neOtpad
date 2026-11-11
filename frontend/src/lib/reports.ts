import type { GeoPoint, Priority, Report, ReportAction, ReportClassification, ReportDetail, ReportStatus, ReportType } from '@/domain/types';

/**
 * Otvorena prijava je ona koja još traži nečiju akciju. Backend zna pet
 * statusa; `odbijena`, `duplikat` i `resena` su završna stanja i svaka izmena
 * nad njima vraća 409 (docs/reports-mvp.md).
 */
export const OPEN_STATUSES: ReportStatus[] = ['nova', 'potvrdjena'];

export const isOpenReport = (r: Pick<Report, 'status'>): boolean => OPEN_STATUSES.includes(r.status);

export const isClosedReport = (r: Pick<Report, 'status'>): boolean => !isOpenReport(r);

/** Tačka prijave; `null` kad je kanal nije mogao poslati (SMS, telefon). */
export const reportPoint = (r: Pick<Report, 'tacka'>): GeoPoint | null => r.tacka ?? null;

/**
 * Predlog klasifikatora, ali samo ako je upotrebljiv.
 *
 * Predlog je vezan za verziju prijave za koju je računat. Čim dispečer izmeni
 * prijavu, verzija se pomeri i stari predlog opisuje sadržaj koji više nije na
 * ekranu — prikazati ga tada je gore nego ne prikazati ništa.
 */
export function freshProposal(
  r: Pick<ReportDetail, 'verzija'> & { klasifikacija?: ReportClassification | null },
): ReportClassification | null {
  const k = r.klasifikacija;
  if (!k || k.status !== 'uspesna' || k.prijava_verzija !== r.verzija) return null;
  return k;
}

/**
 * Predlog odgovora (`tip_obrade`) koji dispečer vidi pri potvrdi. Pravila su
 * iz docs/reports-mvp.md, ne procena: `odvoz` traži prepoznat kontejner i nije
 * za veliki problem, oštećen/nedostajući kontejner je `odrzavanje`, deponija
 * je `ciscenje`, a prijava bez ijednog oslonca ide na `provera_lokacije`.
 */
export function recommendedAction(
  r: Pick<Report, 'tip' | 'kontejner_id' | 'velicina' | 'tacka' | 'opis_lokacije'>,
): ReportAction {
  const locatable = Boolean(r.kontejner_id || r.tacka || r.opis_lokacije);
  if (!locatable) return 'provera_lokacije';
  switch (r.tip) {
    case 'ostecen_kontejner':
    case 'nedostaje_kontejner':
      return 'odrzavanje';
    case 'divlja_deponija':
      return 'ciscenje';
    case 'pun_kontejner':
    case 'prelivanje':
      // Odvoz traži kontejner; velika količina je posao za ekipu, ne za vozilo.
      if (!r.kontejner_id) return 'provera_lokacije';
      return r.velicina === 'velika' ? 'ciscenje' : 'odvoz';
    case 'drugo':
      return 'ciscenje';
  }
}

/** Glagolski oblik za dugmad — REPORT_ACTION_LABEL je za već dodeljenu obradu. */
export const REPORT_ACTION_VERB: Record<ReportAction, string> = {
  odvoz: 'Odvoz komunalnim vozilom',
  ciscenje: 'Čišćenje posebnom ekipom',
  odrzavanje: 'Održavanje kontejnera',
  provera_lokacije: 'Prvo provera lokacije',
};

export const REPORT_ACTION_HINT: Record<ReportAction, string> = {
  odvoz: 'Pun ili prelivajući kontejner ulazi u sledeću rutu. Traži prepoznat kontejner.',
  ciscenje: 'Za deponije i veće količine — ekipa sa mašinama, ne komunalno vozilo.',
  odrzavanje: 'Popravka ili zamena kontejnera; ne rešava se odvozom.',
  provera_lokacije: 'Lokacija nije dovoljno određena — izlazak na proveru pre dodele posla.',
};

/**
 * Obrada koja i dalje traži da se prijava precizira pre rešavanja. Backend ne
 * dozvoljava da se prijava sa `provera_lokacije` zatvori (docs/reports-mvp.md),
 * pa dugme „Reši“ ne sme da se ponudi.
 */
export const needsRefinement = (r: Pick<Report, 'tip_obrade'>): boolean => r.tip_obrade === 'provera_lokacije';

/**
 * Kako odluka operative stiže do prijavioca. Prijava sa sela često dolazi
 * SMS-om, telefonom ili preko predsednika MZ (CLAUDE.md: ne pretpostavljati
 * pametni telefon), pa „građanin vidi u aplikaciji“ nije uvek tačno — operater
 * mora da zna da odgovor mora nekuda da se pošalje.
 */
export function feedbackPath(r: Pick<Report, 'kanal'>, intermediaryName?: string | null): string {
  switch (r.kanal) {
    case 'sms':
      return 'Odgovor ide SMS-om na broj sa kog je prijava stigla.';
    case 'viber':
      return 'Odgovor ide kao Viber poruka prijaviocu.';
    case 'telefon':
      return 'Dispečer javlja prijaviocu telefonom — nema nalog u aplikaciji.';
    case 'posrednik':
      return `Odgovor ide preko posrednika${intermediaryName ? ` (${intermediaryName})` : ''}, koji ga prenosi prijaviocu.`;
    case 'web':
    case 'mobilna':
      // Backend ne vezuje prijavu za nalog: građanin je anoniman i ima samo
      // kratki kod (docs/reports-mvp.md), pa je i ovde odgovor telefonski.
      return 'Prijava je anonimna — prijavilac status proverava po kratkom kodu.';
  }
}

/** Kanali koji ne mogu da nose fotografiju ni GPS tačku — čist SMS i poziv. */
export const isTextOnlyChannel = (kanal: Report['kanal']): boolean => kanal === 'sms' || kanal === 'telefon';

/**
 * Da li se lokacija prijave sme koristiti za merenje rastojanja. Centroid
 * naselja nije izmerena tačka (ista zamka kao `geo_preciznost` kod deponija u
 * docs/data-sources.md): rastojanje do žarišta računato od njega izmišlja
 * preciznost koje nema.
 */
export const isLocationMeasured = (r: Pick<Report, 'preciznost_lokacije'>): boolean => r.preciznost_lokacije !== 'naselje';

/** Prioritet iz ugovora je `number | null`; UI radi sa suženim 1–5. */
export function priorityOf(r: Pick<Report, 'prioritet'>): Priority | null {
  const p = r.prioritet;
  if (p === null || p === undefined) return null;
  const rounded = Math.round(p);
  return rounded >= 1 && rounded <= 5 ? (rounded as Priority) : null;
}

/** Netrijažirana prijava nema prioritet, a mora da stoji ispred trijažiranih. */
export const prioritySortValue = (r: Pick<Report, 'prioritet'>): number => priorityOf(r) ?? 0;

/** Tipovi koje čarobnjak nudi građaninu — ostale unosi dispečer pri trijaži. */
export const CITIZEN_REPORT_TYPES: ReportType[] = ['pun_kontejner', 'prelivanje', 'divlja_deponija', 'ostecen_kontejner', 'drugo'];

/** `drugo` bez opisa backend odbija sa 400 — provera stoji i na formi. */
export const requiresDescription = (tip: ReportType): boolean => tip === 'drugo';
