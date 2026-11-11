import { toPlanRute, toStajalisteRute, toVozilo } from './routing.mapper';

describe('toVozilo', () => {
  it('reads the numeric capacities as numbers', () => {
    const vozilo = toVozilo({
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      oznaka: 'PI-001',
      kapacitet_m3: '16.00',
      kapacitet_kg: '9500.00',
      potrosnja_l_100km: '38.50',
      depo: '0101000020E610000091990B5C1EAB36402F17F19D988D4540',
      aktivno: true,
    });

    expect(vozilo.kapacitet_m3).toBe(16);
    expect(vozilo.potrosnja_l_100km).toBe(38.5);
    expect(vozilo.depo.lat).toBeCloseTo(43.10622, 5);
  });
});

describe('toPlanRute', () => {
  it('keeps the weights the plan was optimised with', () => {
    // Without them nobody can check the claim that cost and the ecological goal
    // are the same objective: the route alone never shows what it traded off.
    const plan = toPlanRute({
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      datum: new Date(2026, 8, 19),
      vozilo_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      status: 'predlog',
      generisan_at: new Date('2026-09-19T02:00:00.000Z'),
      algoritam: 'greedy-risk-aware@1',
      cilj_funkcija: { distanca: 1, rizik_prelivanja: 3, rizik_deponije: 2 },
      ukupna_distanca_m: 84200,
      ukupno_trajanje_min: 265,
    });

    expect(plan.datum).toBe('2026-09-19');
    expect(plan.cilj_funkcija['rizik_deponije']).toBe(2);
    expect(plan.status).toBe('predlog');
  });
});

describe('toStajalisteRute', () => {
  it('carries the reason the stop is on the route', () => {
    const stop = toStajalisteRute({
      id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      plan_rute_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      redosled: 7,
      sabirno_mesto_id: '33333333-3333-3333-3333-333333333333',
      kontejner_id: null,
      prijava_id: null,
      planirani_dolazak: new Date('2026-09-19T08:40:00.000Z'),
      ocekivano_punjenje: 91,
      razlog: 'rizik_divlje_deponije',
      doprinos_ceni: '18.40',
      stvarni_dolazak: null,
      izvrseno: false,
      potvrda_izvora: null,
      prioritet: null,
      komponente: null,
    });

    expect(stop.razlog).toBe('rizik_divlje_deponije');
    expect(stop.doprinos_ceni).toBe(18.4);
    expect(stop.izvrseno).toBe(false);
  });
});
