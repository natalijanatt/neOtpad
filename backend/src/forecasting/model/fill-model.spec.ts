import {
  DEFAULT_PARAMETRI,
  type Ciklus,
  type Merenje,
  type ModelUlaz,
  faktorZa,
  pouzdanostOf,
  prognozaOf,
  stopaCiklusa,
  theilSen,
} from './fill-model';

const SADA = new Date('2026-09-19T06:00:00Z');
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** A cycle filling at a constant rate, sampled every six hours like the generator does. */
function ciklus(opts: {
  kraj: Date | null;
  pocetak: Date;
  ppDan: number;
  tacaka: number;
  pocetniNivo?: number;
  korakSati?: number;
}): Ciklus {
  const korak = (opts.korakSati ?? 6) * HOUR_MS;
  const merenja: Merenje[] = [];
  for (let i = 0; i < opts.tacaka; i++) {
    const at = new Date(opts.pocetak.getTime() + i * korak);
    const sati = (at.getTime() - opts.pocetak.getTime()) / HOUR_MS;
    merenja.push({
      at,
      fillPercent: Math.min(98, (opts.pocetniNivo ?? 0) + (opts.ppDan * sati) / 24),
    });
  }
  return { pocetak: opts.pocetak, kraj: opts.kraj, merenja };
}

/**
 * Three closed weekly cycles at 10 pp/day, then an open one running for three
 * days whose last reading landed six hours ago — a container reporting normally.
 */
function ulaz(over: Partial<ModelUlaz> = {}): ModelUlaz {
  const ciklusi: Ciklus[] = [];
  for (let c = 4; c >= 2; c--) {
    const pocetak = new Date(SADA.getTime() - c * 7 * DAY_MS);
    ciklusi.push(ciklus({ pocetak, kraj: new Date(pocetak.getTime() + 7 * DAY_MS), ppDan: 10, tacaka: 28 }));
  }
  ciklusi.push(ciklus({ pocetak: new Date(SADA.getTime() - 3 * DAY_MS), kraj: null, ppDan: 10, tacaka: 12 }));

  return { sada: SADA, ciklusi, faktori: [], stanjePouzdano: true, ...over };
}

describe('theilSen', () => {
  it('recovers the slope of a clean linear series', () => {
    const c = ciklus({ pocetak: new Date(SADA.getTime() - 3 * DAY_MS), kraj: null, ppDan: 12, tacaka: 12 });
    expect(theilSen(c.merenja)).toBeCloseTo(12, 6);
  });

  it('ignores a single wild reading', () => {
    const c = ciklus({ pocetak: new Date(SADA.getTime() - 3 * DAY_MS), kraj: null, ppDan: 12, tacaka: 12 });
    c.merenja[5] = { at: c.merenja[5].at, fillPercent: 4 };
    expect(theilSen(c.merenja)).toBeCloseTo(12, 1);
  });

  it('has no slope to give for a single reading', () => {
    expect(theilSen([{ at: SADA, fillPercent: 50 }])).toBeNull();
  });
});

describe('stopaCiklusa', () => {
  it('drops saturated readings, so an overflowing container keeps its real rate', () => {
    // 40 pp/day saturates at 98 % after 2.5 days and then reads flat for days.
    const c = ciklus({ pocetak: new Date(SADA.getTime() - 7 * DAY_MS), kraj: null, ppDan: 40, tacaka: 28 });
    const zasicenih = c.merenja.filter((m) => m.fillPercent >= DEFAULT_PARAMETRI.zasicenjeOd).length;

    expect(zasicenih).toBeGreaterThan(10);
    expect(stopaCiklusa(c, DEFAULT_PARAMETRI)).toBeCloseTo(40, 6);
  });

  it('refuses a cycle with too few usable readings', () => {
    const c = ciklus({ pocetak: new Date(SADA.getTime() - DAY_MS), kraj: null, ppDan: 10, tacaka: 2 });
    expect(stopaCiklusa(c, DEFAULT_PARAMETRI)).toBeNull();
  });

  it('refuses a cycle shorter than the minimum span', () => {
    const c = ciklus({ pocetak: new Date(SADA.getTime() - HOUR_MS * 6), kraj: null, ppDan: 10, tacaka: 4, korakSati: 2 });
    expect(stopaCiklusa(c, DEFAULT_PARAMETRI)).toBeNull();
  });
});

describe('prognozaOf', () => {
  it('has nothing to say about a container that never reported', () => {
    expect(prognozaOf(ulaz({ ciklusi: [] }))).toBeNull();
  });

  it('blends history with the current cycle', () => {
    // History says 10 pp/day, the open cycle says 20 over 9 readings: w = 9/13.
    const base = ulaz();
    const brzi = ciklus({ pocetak: new Date(SADA.getTime() - 2 * DAY_MS), kraj: null, ppDan: 20, tacaka: 9 });
    const p = prognozaOf({ ...base, ciklusi: [...base.ciklusi.slice(0, 3), brzi] });

    const w = 9 / (9 + DEFAULT_PARAMETRI.k);
    expect(p?.stopaPpDan).toBeCloseTo(w * 20 + (1 - w) * 10, 1);
  });

  it('leans on history when the current cycle has barely started', () => {
    const base = ulaz();
    const tek = ciklus({ pocetak: new Date(SADA.getTime() - 18 * HOUR_MS), kraj: null, ppDan: 30, tacaka: 4 });
    const p = prognozaOf({ ...base, ciklusi: [...base.ciklusi.slice(0, 3), tek] });

    // Four readings against k = 4 is half weight, so the spike is halved, not believed.
    expect(p?.stopaPpDan).toBeCloseTo(20, 1);
  });

  it('carries the last reading forward to now instead of starting from it', () => {
    const p = prognozaOf(ulaz());
    const prva = p!.serija[0];

    // Last reading: 66 h into a 10 pp/day cycle, so 27,5 % — taken 6 h ago.
    expect(prva.t).toBe(SADA.toISOString());
    expect(prva.p50).toBeCloseTo(30, 1);
  });

  it('dates the crossing of 95 %', () => {
    const p = prognozaOf(ulaz());
    const sati = (p!.vremeKriticnog!.getTime() - SADA.getTime()) / HOUR_MS;

    // From 30 % at 10 pp/day: 65 points to go, 6,5 days.
    expect(sati).toBeCloseTo(156, 0);
  });

  it('interpolates the crossing inside a step rather than snapping to the grid', () => {
    // 13 pp/day puts the crossing at 103,4 h, which no six-hour grid point hits.
    const brz = ciklus({ pocetak: new Date(SADA.getTime() - 3 * DAY_MS), kraj: null, ppDan: 13, tacaka: 12 });
    const p = prognozaOf({ sada: SADA, ciklusi: [brz], faktori: [], stanjePouzdano: true });
    const sati = (p!.vremeKriticnog!.getTime() - SADA.getTime()) / HOUR_MS;

    expect(sati).toBeCloseTo(103.4, 1);
    expect(p!.vremeKriticnog!.getTime() % (6 * HOUR_MS)).not.toBe(0);
  });

  it('reports a container already over the threshold as critical in the past', () => {
    const pun = ciklus({ pocetak: new Date(SADA.getTime() - 5 * DAY_MS), kraj: null, ppDan: 20, tacaka: 20 });
    const base = ulaz();
    const p = prognozaOf({ ...base, ciklusi: [...base.ciklusi.slice(0, 3), pun] });

    expect(p!.serija[0].p50).toBeGreaterThanOrEqual(95);
    expect(p!.vremeKriticnog!.getTime()).toBeLessThan(SADA.getTime());
  });

  it('never forecasts a container emptying itself', () => {
    const pada: Ciklus = {
      pocetak: new Date(SADA.getTime() - 2 * DAY_MS),
      kraj: null,
      merenja: [
        { at: new Date(SADA.getTime() - 2 * DAY_MS), fillPercent: 60 },
        { at: new Date(SADA.getTime() - DAY_MS), fillPercent: 55 },
        { at: new Date(SADA.getTime() - 12 * HOUR_MS), fillPercent: 50 },
      ],
    };
    const p = prognozaOf({ sada: SADA, ciklusi: [pada], faktori: [], stanjePouzdano: true });

    expect(p!.stopaPpDan).toBe(0);
    expect(p!.vremeKriticnog).toBeNull();
    expect(p!.serija[p!.serija.length - 1].p50).toBeCloseTo(50, 1);
  });

  it('pulls the crossing forward when a calendar event doubles the rate', () => {
    const bez = prognozaOf(ulaz());
    const sa = prognozaOf(
      ulaz({
        faktori: [{ od: new Date(SADA.getTime() + DAY_MS), do: new Date(SADA.getTime() + 3 * DAY_MS), faktor: 2 }],
      }),
    );

    expect(sa!.vremeKriticnog!.getTime()).toBeLessThan(bez!.vremeKriticnog!.getTime());
  });

  it('caps overlapping factors instead of multiplying them without bound', () => {
    const faktori = [
      { od: new Date(SADA.getTime() - DAY_MS), do: new Date(SADA.getTime() + DAY_MS), faktor: 2 },
      { od: new Date(SADA.getTime() - DAY_MS), do: new Date(SADA.getTime() + DAY_MS), faktor: 3 },
    ];
    expect(faktorZa(SADA, faktori, DEFAULT_PARAMETRI)).toBe(DEFAULT_PARAMETRI.maxFaktor);
  });

  it('marks a gap instead of interpolating it away', () => {
    const base = ulaz();
    const otvoren = base.ciklusi[base.ciklusi.length - 1];
    // Two days missing in the middle of a six-hour cadence.
    otvoren.merenja.splice(3, 4);

    const p = prognozaOf(base);
    expect(p!.imaRupu).toBe(true);
    expect(p!.pouzdanost).toBe('niska');
  });

  it('spans the whole horizon at the configured step', () => {
    const p = prognozaOf(ulaz());
    expect(p!.serija).toHaveLength(DEFAULT_PARAMETRI.horizontSati / DEFAULT_PARAMETRI.korakSati + 1);
    expect(p!.horizontDo.getTime() - SADA.getTime()).toBe(DEFAULT_PARAMETRI.horizontSati * HOUR_MS);
  });

  it('keeps the band ordered and inside 0..100', () => {
    for (const tacka of prognozaOf(ulaz())!.serija) {
      expect(tacka.p10).toBeLessThanOrEqual(tacka.p50);
      expect(tacka.p50).toBeLessThanOrEqual(tacka.p90);
      expect(tacka.p10).toBeGreaterThanOrEqual(0);
      expect(tacka.p90).toBeLessThanOrEqual(100);
    }
  });

  it('records the parameters it ran with', () => {
    expect(prognozaOf(ulaz())!.modelVerzija).toBe('hibrid-v1(prag=95,horizont=168h,korak=6h,k=4)');
  });

  it('reads the last reading time as the input watermark', () => {
    const p = prognozaOf(ulaz());
    expect(p!.ulazniPodaciDo.getTime()).toBe(SADA.getTime() - 6 * HOUR_MS);
  });
});

describe('pouzdanostOf', () => {
  const base = {
    zatvorenihSaStopom: 3,
    tekucihMerenja: 4,
    imaRupu: false,
    zastarelost: 6 * HOUR_MS,
    kadenca: 6 * HOUR_MS,
    stanjePouzdano: true,
  };

  it('is high with three cycles, no gap and a fresh reading', () => {
    expect(pouzdanostOf(base)).toBe('visoka');
  });

  it('is low without a single closed cycle', () => {
    expect(pouzdanostOf({ ...base, zatvorenihSaStopom: 0 })).toBe('niska');
  });

  it('is low for a silent device', () => {
    expect(pouzdanostOf({ ...base, zastarelost: 3 * 6 * HOUR_MS })).toBe('niska');
  });

  it('is low when the container state carries a fault code', () => {
    expect(pouzdanostOf({ ...base, stanjePouzdano: false })).toBe('niska');
  });

  it('is medium with history but a thin current cycle', () => {
    expect(pouzdanostOf({ ...base, tekucihMerenja: 1 })).toBe('srednja');
  });
});
