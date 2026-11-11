/**
 * The fill model: from a container's reading history to a forecast curve.
 *
 * Pure functions — no Nest, no database, no clock of its own. Everything the
 * model needs arrives as an argument, which is what lets the whole of
 * `docs/fill-forecasting.md` be checked by unit tests rather than against a
 * fixture database.
 *
 * The curve is deliberately **free-running**: it answers "when would this
 * overflow if nobody came", and never subtracts a scheduled collection. The
 * routing heuristic has its own `rutinski` term for the schedule
 * (`docs/routing-heuristic.md`), and folding the plan in here would count it
 * twice — and would hand routing a NULL for every container the plan happens to
 * reach in time, which is precisely the container worth watching.
 */

export type Pouzdanost = 'visoka' | 'srednja' | 'niska';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** One reliable reading. The repository filters out `pouzdano = false` rows. */
export interface Merenje {
  at: Date;
  /** `ocitavanje.fill_percent_izracunat`: recomputed server-side from the mounting's depth. */
  fillPercent: number;
}

/**
 * Readings between two emptyings. `kraj` is null for the cycle still running,
 * and that cycle is the one whose slope describes the container *now*.
 */
export interface Ciklus {
  pocetak: Date;
  kraj: Date | null;
  merenja: Merenje[];
}

/** A seasonality window from `kalendarski_dogadjaj`, already resolved to this container. */
export interface KalendarskiFaktor {
  od: Date;
  do: Date;
  faktor: number;
}

export interface ModelParametri {
  /** Critical level in percent. 95 is also the `prelivanje` alarm threshold (`docs/sensor-telemetry.md`). */
  pragKriticnog: number;
  horizontSati: number;
  korakSati: number;
  /**
   * Shrinkage constant of the hybrid blend, in readings. The current cycle gets
   * weight `n / (n + k)`, so at the default 6-hour cadence a day of readings
   * buys it half the say. Two readings after an emptying must not be allowed to
   * redraw a curve that six cycles of history disagree with.
   */
  k: number;
  /** How many closed cycles feed the historical median. Older than this is another season. */
  maxCiklusa: number;
  minMerenja: number;
  minRasponSati: number;
  /**
   * Readings at or above this are dropped from every slope fit. The curve
   * saturates — the sensor cannot measure below 2 cm, so a container packed to
   * the lid reads 98 % and stays there. Those points are flat by construction,
   * and letting them into the fit flattens the rate of exactly the containers
   * that overflow most often.
   */
  zasicenjeOd: number;
  minFaktor: number;
  maxFaktor: number;
  /** Relative half-width of the p10/p90 band when there is no cycle-to-cycle spread to measure. */
  relativniOpseg: number;
}

export const DEFAULT_PARAMETRI: ModelParametri = {
  pragKriticnog: 95,
  horizontSati: 168,
  korakSati: 6,
  k: 4,
  maxCiklusa: 6,
  minMerenja: 3,
  minRasponSati: 12,
  zasicenjeOd: 96,
  minFaktor: 0.5,
  maxFaktor: 3,
  relativniOpseg: 0.35,
};

export interface SerijaTacka {
  t: string;
  p10: number;
  p50: number;
  p90: number;
}

export interface ModelUlaz {
  sada: Date;
  /** Chronological; the open cycle, if any, is last. */
  ciklusi: Ciklus[];
  faktori: KalendarskiFaktor[];
  /** `kontejner_stanje`: no fault codes and not silent. A blocked sensor reads as full. */
  stanjePouzdano: boolean;
  parametri?: Partial<ModelParametri>;
}

export interface Prognoza {
  serija: SerijaTacka[];
  vremeKriticnog: Date | null;
  ulazniPodaciDo: Date;
  horizontDo: Date;
  imaRupu: boolean;
  pouzdanost: Pouzdanost;
  /** The blended rate in percentage points per day; kept for tests and for the log line. */
  stopaPpDan: number;
  modelVerzija: string;
}

/**
 * The model version string carries its parameters, because `prognoza_punjenja`
 * has no column for them and a stored forecast that cannot say what it assumed
 * is not reproducible. Same reason `plan_rute` stores the weights it was
 * planned with.
 */
export function modelVerzija(p: ModelParametri): string {
  return `hibrid-v1(prag=${p.pragKriticnog},horizont=${p.horizontSati}h,korak=${p.korakSati}h,k=${p.k})`;
}

function medijana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function percentil(xs: number[], q: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const idx = (s.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

const clampFill = (x: number): number => Math.min(100, Math.max(0, x));

/**
 * Theil–Sen: the median of all pairwise slopes, in percentage points per day.
 *
 * Least squares over four points lets one bad reading steer the whole line, and
 * a container has no shortage of odd readings — a bag left on the lid, the load
 * settling. The median of pairs ignores up to a third of them.
 */
export function theilSen(merenja: Merenje[]): number | null {
  const nagibi: number[] = [];

  for (let i = 0; i < merenja.length; i++) {
    for (let j = i + 1; j < merenja.length; j++) {
      const dt = merenja[j].at.getTime() - merenja[i].at.getTime();
      if (dt <= 0) continue;
      nagibi.push(((merenja[j].fillPercent - merenja[i].fillPercent) * DAY_MS) / dt);
    }
  }

  return medijana(nagibi);
}

/**
 * The fill rate of one cycle, or null when the cycle cannot support a slope:
 * too few usable readings, too short a span, or nothing left once the saturated
 * readings are dropped.
 */
export function stopaCiklusa(ciklus: Ciklus, p: ModelParametri): number | null {
  const upotrebljiva = ciklus.merenja.filter((m) => m.fillPercent < p.zasicenjeOd);
  if (upotrebljiva.length < p.minMerenja) return null;

  const raspon = upotrebljiva[upotrebljiva.length - 1].at.getTime() - upotrebljiva[0].at.getTime();
  if (raspon < p.minRasponSati * HOUR_MS) return null;

  return theilSen(upotrebljiva);
}

/** Product of every calendar factor covering `t`, bounded so overlapping events cannot run away. */
export function faktorZa(t: Date, faktori: KalendarskiFaktor[], p: ModelParametri): number {
  let f = 1;
  for (const k of faktori) {
    if (t >= k.od && t <= k.do) f *= k.faktor;
  }
  return Math.min(p.maxFaktor, Math.max(p.minFaktor, f));
}

/**
 * Percentage points accumulated between two instants at rate `r`, integrated in
 * hourly slices so that a calendar factor starting mid-window applies to the
 * part of the window it actually covers.
 */
function porast(od: Date, doTrenutka: Date, r: number, faktori: KalendarskiFaktor[], p: ModelParametri): number {
  const odMs = od.getTime();
  const doMs = doTrenutka.getTime();
  if (doMs <= odMs) return 0;
  if (faktori.length === 0) return (r * (doMs - odMs)) / DAY_MS;

  let ukupno = 0;
  for (let t = odMs; t < doMs; t += HOUR_MS) {
    const kraj = Math.min(t + HOUR_MS, doMs);
    const sredina = new Date(t + (kraj - t) / 2);
    ukupno += (r * faktorZa(sredina, faktori, p) * (kraj - t)) / DAY_MS;
  }
  return ukupno;
}

/** Linear interpolation of the instant a segment crosses `prag`. */
function trenutakPrelaska(odT: number, odNivo: number, doT: number, doNivo: number, prag: number): Date {
  const raspon = doNivo - odNivo;
  const udeo = raspon <= 0 ? 0 : (prag - odNivo) / raspon;
  return new Date(odT + (doT - odT) * Math.min(1, Math.max(0, udeo)));
}

interface Nivo {
  p10: number;
  p50: number;
  p90: number;
}

function zaokruzi(n: Nivo): Nivo {
  return {
    p10: Math.round(n.p10 * 10) / 10,
    p50: Math.round(n.p50 * 10) / 10,
    p90: Math.round(n.p90 * 10) / 10,
  };
}

/**
 * The forecast, or null when the container has nothing to forecast from — no
 * reading has ever arrived, or every cycle is too short to give a slope. A
 * container with no forecast is not an oversight: routing's `bez_senzora` term
 * is what covers it, and an invented curve would outrank that.
 */
export function prognozaOf(ulaz: ModelUlaz): Prognoza | null {
  const p: ModelParametri = { ...DEFAULT_PARAMETRI, ...ulaz.parametri };
  const sva = ulaz.ciklusi.flatMap((c) => c.merenja).sort((a, b) => a.at.getTime() - b.at.getTime());
  if (sva.length === 0) return null;

  const poslednje = sva[sva.length - 1];
  const otvoreni = ulaz.ciklusi.find((c) => c.kraj === null) ?? null;
  const zatvoreni = ulaz.ciklusi.filter((c) => c.kraj !== null);

  // Historical base: the most recent closed cycles, older ones dropped. A rate
  // from last winter is a different season, not more evidence about this week.
  const stopeIstorije = zatvoreni
    .slice(-p.maxCiklusa)
    .map((c) => stopaCiklusa(c, p))
    .filter((s): s is number => s !== null);

  const rHist = medijana(stopeIstorije);
  const rCur = otvoreni ? stopaCiklusa(otvoreni, p) : null;
  const nCur = otvoreni ? otvoreni.merenja.filter((m) => m.fillPercent < p.zasicenjeOd).length : 0;

  let r: number;
  if (rCur !== null && rHist !== null) {
    const w = nCur / (nCur + p.k);
    r = w * rCur + (1 - w) * rHist;
  } else if (rCur !== null) {
    r = rCur;
  } else if (rHist !== null) {
    r = rHist;
  } else {
    return null;
  }

  // Waste does not leave a container by itself. A negative blended rate is
  // measurement noise, and letting it through would draw a curve sloping down
  // towards an empty container nobody emptied.
  r = Math.max(0, r);

  // Cadence, and the gap rule that follows from it: two missed uplinks is the
  // same threshold `sensor-telemetry.md` uses for silence.
  const razmaci: number[] = [];
  for (let i = 1; i < sva.length; i++) razmaci.push(sva[i].at.getTime() - sva[i - 1].at.getTime());
  const kadenca = medijana(razmaci);
  const najveciRazmak = razmaci.length > 0 ? Math.max(...razmaci) : 0;
  const imaRupu = kadenca !== null && najveciRazmak > 2 * kadenca;

  // Band: the spread the container's own cycles actually showed. With too few
  // cycles to measure a spread there is nothing honest to derive, so the band
  // falls back to a fixed relative width and the confidence rating says why.
  const dovoljnoZaOpseg = stopeIstorije.length >= 3;
  const rLow = dovoljnoZaOpseg
    ? Math.max(0, percentil(stopeIstorije, 0.1) ?? r)
    : Math.max(0, r * (1 - p.relativniOpseg));
  const rHigh = dovoljnoZaOpseg ? Math.max(r, percentil(stopeIstorije, 0.9) ?? r) : r * (1 + p.relativniOpseg);

  // Where the curve starts: the last reading, carried forward to `sada` at the
  // blended rate. Not the reading itself — between the last uplink and now the
  // container kept filling, and for a silent device that is a long way.
  const nivoSada: Nivo = {
    p10: clampFill(poslednje.fillPercent + porast(poslednje.at, ulaz.sada, rLow, ulaz.faktori, p)),
    p50: clampFill(poslednje.fillPercent + porast(poslednje.at, ulaz.sada, r, ulaz.faktori, p)),
    p90: clampFill(poslednje.fillPercent + porast(poslednje.at, ulaz.sada, rHigh, ulaz.faktori, p)),
  };

  const koraka = Math.round(p.horizontSati / p.korakSati);
  const horizontDo = new Date(ulaz.sada.getTime() + p.horizontSati * HOUR_MS);
  const serija: SerijaTacka[] = [{ t: ulaz.sada.toISOString(), ...zaokruzi(nivoSada) }];

  let tekuci = nivoSada;
  let vremeKriticnog: Date | null = null;

  for (let i = 1; i <= koraka; i++) {
    const od = new Date(ulaz.sada.getTime() + (i - 1) * p.korakSati * HOUR_MS);
    const doT = new Date(ulaz.sada.getTime() + i * p.korakSati * HOUR_MS);
    const sledeci: Nivo = {
      p10: clampFill(tekuci.p10 + porast(od, doT, rLow, ulaz.faktori, p)),
      p50: clampFill(tekuci.p50 + porast(od, doT, r, ulaz.faktori, p)),
      p90: clampFill(tekuci.p90 + porast(od, doT, rHigh, ulaz.faktori, p)),
    };

    if (vremeKriticnog === null && tekuci.p50 < p.pragKriticnog && sledeci.p50 >= p.pragKriticnog) {
      vremeKriticnog = trenutakPrelaska(od.getTime(), tekuci.p50, doT.getTime(), sledeci.p50, p.pragKriticnog);
    }

    serija.push({ t: doT.toISOString(), ...zaokruzi(sledeci) });
    tekuci = sledeci;
  }

  // Already over the threshold: the crossing is in the past, and dating it to
  // "now" would tell routing the container has just become urgent when it has
  // been overflowing since yesterday. Estimated backwards from the last reading
  // at the blended rate; the calendar is not applied to a window that is over.
  if (nivoSada.p50 >= p.pragKriticnog) {
    const iznad = poslednje.fillPercent - p.pragKriticnog;
    vremeKriticnog = r > 0 && iznad > 0 ? new Date(poslednje.at.getTime() - (iznad / r) * DAY_MS) : poslednje.at;
  }

  return {
    serija,
    vremeKriticnog,
    ulazniPodaciDo: poslednje.at,
    horizontDo,
    imaRupu,
    pouzdanost: pouzdanostOf({
      zatvorenihSaStopom: stopeIstorije.length,
      tekucihMerenja: nCur,
      imaRupu,
      zastarelost: ulaz.sada.getTime() - poslednje.at.getTime(),
      kadenca,
      stanjePouzdano: ulaz.stanjePouzdano,
    }),
    stopaPpDan: Math.round(r * 100) / 100,
    modelVerzija: modelVerzija(p),
  };
}

interface PouzdanostUlaz {
  zatvorenihSaStopom: number;
  tekucihMerenja: number;
  imaRupu: boolean;
  zastarelost: number;
  kadenca: number | null;
  stanjePouzdano: boolean;
}

/**
 * How much the forecast deserves to be believed. It is a label for the
 * dispatcher, not an input to routing — routing has its own reliability rule and
 * zeroes the overflow term on an untrustworthy reading regardless of what this
 * says.
 */
export function pouzdanostOf(u: PouzdanostUlaz): Pouzdanost {
  const kadenca = u.kadenca ?? Number.POSITIVE_INFINITY;
  const tiho = u.zastarelost > 2 * kadenca;

  if (u.zatvorenihSaStopom < 1 || u.imaRupu || tiho || !u.stanjePouzdano) return 'niska';
  if (u.zatvorenihSaStopom >= 3 && u.tekucihMerenja >= 3 && u.zastarelost <= kadenca) return 'visoka';
  return 'srednja';
}
