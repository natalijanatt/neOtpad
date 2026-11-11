import {
  type KontejnerKandidat,
  type ObjectiveWeights,
  PRIORITET_TERMS,
  type PrioritetKomponente,
  type PrioritetTerm,
  type RazlogStajalista,
  type ScoredCandidate,
  type ScoredKontejner,
  type StopCandidate,
} from './route-optimizer.port';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Forecast ETA to critical within this many hours makes the stop mandatory. */
export const HITNO_SATI = 48;
/**
 * Without a forecast, a reliable reading at or above this is "critical now": a
 * shared 1.1 m³ container past 80 % is a day or two from overflowing, which is
 * inside the same 48-hour window the forecast rule uses.
 */
export const HITNO_FILL_PERCENT = 80;
/**
 * A reliable reading below this floor disqualifies the container as a
 * candidate entirely — every term is zeroed, not just `prelivanje`. A truck
 * does not detour for a report or a black-spot risk score on a container that
 * is demonstrably not full; that case is a maintenance/illegal-dump concern
 * routed elsewhere, not a collection stop today.
 */
export const MIN_POPUNJENOST_ZA_KANDIDATA = 20;
/** Fallback collection cycle for an unsensored container whose stream has no schedule row. */
const PODRAZUMEVANI_CIKLUS_DANA = 14;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * Overflow urgency of one container. A forecast outranks the raw fill level,
 * and an unreliable reading contributes nothing: blocked optics read as "full",
 * and sending a truck for that is the failure `sensor-telemetry.md` warns about.
 */
function prelivanjeKontejnera(k: KontejnerKandidat, sada: Date): number {
  if (!k.pouzdano) return 0;

  if (k.vremeKriticnog !== null) {
    const sati = (k.vremeKriticnog.getTime() - sada.getTime()) / HOUR_MS;
    if (sati <= 24) return 1;
    if (sati <= 48) return 0.8;
    if (sati <= 72) return 0.5;
    if (sati <= 168) return 0.2;
    return 0;
  }

  if (k.fillPercent === null) return 0;
  if (k.fillPercent >= 90) return 1;
  if (k.fillPercent >= 80) return 0.7;
  if (k.fillPercent >= 60) return 0.3;
  return 0;
}

function hitnoKontejnera(k: KontejnerKandidat, sada: Date): boolean {
  if (!k.pouzdano) return false;
  if (k.vremeKriticnog !== null) {
    return (k.vremeKriticnog.getTime() - sada.getTime()) / HOUR_MS <= HITNO_SATI;
  }
  return k.fillPercent !== null && k.fillPercent >= HITNO_FILL_PERCENT;
}

/**
 * An unsensored container is invisible to every other term, so its own
 * collection cycle stands in for the sensor: the closer to (or past) the
 * cycle, the higher.
 */
function bezSenzora(k: KontejnerKandidat, sada: Date): number {
  if (k.imaSenzor) return 0;
  const ciklus = k.ciklusDana ?? PODRAZUMEVANI_CIKLUS_DANA;
  if (k.poslednjePraznjenje === null) return 1;
  const dana = (sada.getTime() - k.poslednjePraznjenje.getTime()) / DAY_MS;
  return clamp01(dana / ciklus);
}

function prijavaTerm(tip: string): number {
  if (tip === 'pun_kontejner' || tip === 'prelivanje') return 1;
  if (tip === 'ostecen_kontejner') return 0.5;
  return 0.3;
}

function pokrivenostTerm(c: StopCandidate): number {
  // Settlements outside organised collection are where dumps appear, so a point
  // placed there is worth more than the same point in a served village.
  switch (c.organizovanoPrikupljanje) {
    case 'ne':
      return 1;
    case 'nepoznato':
      return 0.5;
    default:
      return 0;
  }
}

/** Points serving many households first; log-scaled so 500 is not ten times 50. */
function domacinstvaTerm(n: number | null): number {
  if (n === null || n <= 0) return 0;
  return clamp01(Math.log10(1 + n) / 3);
}

const RAZLOG_PO_TERMU: Record<PrioritetTerm, RazlogStajalista> = {
  prelivanje: 'prelivanje_rizik',
  rizik: 'rizik_divlje_deponije',
  prijava: 'prijava',
  // An uncovered settlement is on the route for the same reason a black spot is.
  pokrivenost: 'rizik_divlje_deponije',
  // Each of these is its own, distinct claim — none of them means "today is
  // the scheduled pickup day", so none of them may say `rutinski`.
  domacinstva: 'domacinstva',
  rutinski: 'rutinski',
  bez_senzora: 'bez_senzora',
};

interface DeljeniTermini {
  rizik: number;
  pokrivenost: number;
  domacinstva: number;
}

/**
 * One container's priority. `deljeno` carries the terms that are properties of
 * the point/settlement rather than the container (risk score, coverage,
 * household count) — every container at a point sees the same value there, so
 * two bins side by side are not scored as if one were in an uncovered village
 * and the other were not.
 */
/** A reliable reading that is demonstrably far from full — see `MIN_POPUNJENOST_ZA_KANDIDATA`. */
function ispodMinimuma(k: KontejnerKandidat): boolean {
  return k.pouzdano && k.fillPercent !== null && k.fillPercent < MIN_POPUNJENOST_ZA_KANDIDATA;
}

function prioritetKontejnera(
  k: KontejnerKandidat,
  deljeno: DeljeniTermini,
  tezine: ObjectiveWeights,
  sada: Date,
): ScoredKontejner {
  if (ispodMinimuma(k)) {
    const nulte = Object.fromEntries(PRIORITET_TERMS.map((t) => [t, { vrednost: 0, doprinos: 0 }])) as PrioritetKomponente;
    return { ...k, prioritet: 0, obavezno: false, razlog: 'usput', komponente: nulte };
  }

  const vrednosti: Record<PrioritetTerm, number> = {
    prelivanje: prelivanjeKontejnera(k, sada),
    rizik: deljeno.rizik,
    prijava: k.prijava === null ? 0 : prijavaTerm(k.prijava.tip),
    pokrivenost: deljeno.pokrivenost,
    domacinstva: deljeno.domacinstva,
    rutinski: k.rutinskiDanas ? 1 : 0,
    bez_senzora: bezSenzora(k, sada),
  };

  const komponente = {} as PrioritetKomponente;
  let prioritet = 0;
  let top: PrioritetTerm | null = null;
  for (const term of PRIORITET_TERMS) {
    const doprinos = tezine[term] * vrednosti[term];
    komponente[term] = { vrednost: vrednosti[term], doprinos };
    prioritet += doprinos;
    if (doprinos > 0 && (top === null || doprinos > komponente[top].doprinos)) {
      top = term;
    }
  }

  return {
    ...k,
    prioritet,
    obavezno: hitnoKontejnera(k, sada) || k.prijava !== null || prioritet >= tezine.prag_obaveznog,
    razlog: top === null ? 'usput' : RAZLOG_PO_TERMU[top],
    komponente,
  };
}

/**
 * The product claim, as a function. A point's score is its worst container's:
 * visiting is driven by whichever bin needs it most, and every other bin there
 * rides along for free since the truck is already stopping. Every container's
 * own score is kept in `kontejneri` so the UI can show which one it actually was.
 */
export function prioritetOf(c: StopCandidate, tezine: ObjectiveWeights, sada: Date): ScoredCandidate {
  const deljeno: DeljeniTermini = {
    rizik: c.rizik === null ? 0 : c.rizik.klasifikacija === 'crna_tacka' ? 1 : clamp01(c.rizik.skor / 100),
    pokrivenost: pokrivenostTerm(c),
    domacinstva: domacinstvaTerm(c.brojDomacinstava),
  };

  const kontejneri = c.kontejneri.map((k) => prioritetKontejnera(k, deljeno, tezine, sada));
  const najgori = kontejneri.reduce((best, k) => (k.prioritet > best.prioritet ? k : best));

  const ocekivanoPunjenje = Math.max(
    0,
    ...kontejneri.filter((k) => k.pouzdano && k.fillPercent !== null).map((k) => k.fillPercent as number),
  );

  return {
    ...c,
    kontejneri,
    prioritet: najgori.prioritet,
    obavezno: kontejneri.some((k) => k.obavezno),
    razlog: najgori.razlog,
    komponente: najgori.komponente,
    ocekivanoPunjenje,
  };
}
