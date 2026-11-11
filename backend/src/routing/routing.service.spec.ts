import { prioritetOf } from './optimizer/priority';
import { DEFAULT_WEIGHTS, type KontejnerKandidat, type StopCandidate } from './optimizer/route-optimizer.port';
import type { ForecastingService } from '../forecasting/forecasting.service';
import { assembleCandidates, landsOn, relevantKontejneri, RoutingService } from './routing.service';
import type { CandidateSources, RoutingRepository } from './routing.repository';

function sources(over: Partial<CandidateSources> = {}): CandidateSources {
  return {
    sabirnaMesta: [
      {
        id: 'sm-1',
        naziv: 'Krupac - centar',
        naselje_id: 'n-1',
        broj_domacinstava: 48,
        organizovano_prikupljanje: 'da',
        lat: 43.116,
        lon: 22.675,
      },
    ],
    kontejneri: [
      {
        id: 'k-1',
        oznaka: 'PI-KRU-001',
        sabirno_mesto_id: 'sm-1',
        zapremina_l: 1100,
        tip_otpada: 'komunalni',
        fill_percent: 85,
        aktivni_status: [],
        tih_od: null,
      },
    ],
    prognoze: [],
    rizici: [],
    prijave: [],
    senzori: new Set(['k-1']),
    praznjenja: [],
    rasporedi: [],
    ...over,
  };
}

describe('assembleCandidates', () => {
  it('marks a state with a diagnostic code or a silent device as unreliable', () => {
    const [c] = assembleCandidates(
      sources({
        kontejneri: [
          { id: 'k-1', oznaka: 'k-1', sabirno_mesto_id: 'sm-1', zapremina_l: 1100, tip_otpada: 'komunalni', fill_percent: 98, aktivni_status: ['optics_blocked'], tih_od: null },
          { id: 'k-2', oznaka: 'k-2', sabirno_mesto_id: 'sm-1', zapremina_l: 1100, tip_otpada: 'komunalni', fill_percent: 50, aktivni_status: [], tih_od: new Date() },
          { id: 'k-3', oznaka: 'k-3', sabirno_mesto_id: 'sm-1', zapremina_l: 1100, tip_otpada: 'komunalni', fill_percent: 50, aktivni_status: ['ok'], tih_od: null },
        ],
      }),
      '2026-09-19',
    );
    expect(c.kontejneri.map((k) => k.pouzdano)).toEqual([false, false, true]);
  });

  it('drops a collection point with no active container', () => {
    expect(assembleCandidates(sources({ kontejneri: [] }), '2026-09-19')).toEqual([]);
  });

  it('attaches a report to the container it names', () => {
    const [c] = assembleCandidates(
      sources({
        kontejneri: [
          { id: 'k-1', oznaka: 'k-1', sabirno_mesto_id: 'sm-1', zapremina_l: 1100, tip_otpada: 'komunalni', fill_percent: 85, aktivni_status: [], tih_od: null },
          { id: 'k-2', oznaka: 'k-2', sabirno_mesto_id: 'sm-1', zapremina_l: 1100, tip_otpada: 'suvi_reciklabilni', fill_percent: 20, aktivni_status: [], tih_od: null },
        ],
        prijave: [{ id: 'p-1', tip: 'pun_kontejner', kontejner_id: 'k-1', naselje_id: null, lat: null, lon: null }],
      }),
      '2026-09-19',
    );
    const komunalni = c.kontejneri.find((k) => k.kontejnerId === 'k-1')!;
    const reciklaza = c.kontejneri.find((k) => k.kontejnerId === 'k-2')!;
    expect(komunalni.prijava?.id).toBe('p-1');
    expect(reciklaza.prijava).toBeNull();
  });

  it('shares a location-only report across every container at the matched point, and drops one too far away', () => {
    const [near] = assembleCandidates(
      sources({ prijave: [{ id: 'p-2', tip: 'prelivanje', kontejner_id: null, naselje_id: 'n-1', lat: 43.1165, lon: 22.6755 }] }),
      '2026-09-19',
    );
    const [far] = assembleCandidates(
      sources({ prijave: [{ id: 'p-3', tip: 'prelivanje', kontejner_id: null, naselje_id: 'n-1', lat: 43.13, lon: 22.7 }] }),
      '2026-09-19',
    );

    expect(near.kontejneri[0].prijava?.id).toBe('p-2');
    expect(far.kontejneri[0].prijava).toBeNull();
  });

  it('falls back from point risk to settlement risk', () => {
    const [own] = assembleCandidates(
      sources({
        rizici: [
          { subjekat_tip: 'naselje', subjekat_id: 'n-1', skor: '30', klasifikacija: 'srednji' },
          { subjekat_tip: 'sabirno_mesto', subjekat_id: 'sm-1', skor: '70', klasifikacija: 'visok' },
        ],
      }),
      '2026-09-19',
    );
    const [inherited] = assembleCandidates(
      sources({ rizici: [{ subjekat_tip: 'naselje', subjekat_id: 'n-1', skor: '30', klasifikacija: 'srednji' }] }),
      '2026-09-19',
    );
    expect(own.rizik?.skor).toBe(70);
    expect(inherited.rizik?.skor).toBe(30);
  });

  it('reads the schedule for each container’s own waste stream, not the whole point', () => {
    const [c] = assembleCandidates(
      sources({
        kontejneri: [
          { id: 'k-1', oznaka: 'k-1', sabirno_mesto_id: 'sm-1', zapremina_l: 1100, tip_otpada: 'komunalni', fill_percent: 20, aktivni_status: [], tih_od: null },
          { id: 'k-2', oznaka: 'k-2', sabirno_mesto_id: 'sm-1', zapremina_l: 1100, tip_otpada: 'staklo', fill_percent: 20, aktivni_status: [], tih_od: null },
        ],
        rasporedi: [
          // 2026-09-19 is a Saturday (ISO 6).
          { naselje_id: 'n-1', tip_otpada: 'komunalni', dan_u_nedelji: 6, ciklus_dana: 7, referentni_datum: null },
          { naselje_id: 'n-1', tip_otpada: 'staklo', dan_u_nedelji: 3, ciklus_dana: 28, referentni_datum: null },
        ],
      }),
      '2026-09-19',
    );
    const komunalni = c.kontejneri.find((k) => k.kontejnerId === 'k-1')!;
    const staklo = c.kontejneri.find((k) => k.kontejnerId === 'k-2')!;
    expect(komunalni.rutinskiDanas).toBe(true);
    expect(komunalni.ciklusDana).toBe(7);
    expect(staklo.rutinskiDanas).toBe(false);
    expect(staklo.ciklusDana).toBe(28);
  });
});

describe('landsOn', () => {
  it('fires weekly on the weekday alone', () => {
    const r = { dan_u_nedelji: 1, ciklus_dana: 7, referentni_datum: null };
    expect(landsOn(r, '2026-09-21')).toBe(true); // Monday
    expect(landsOn(r, '2026-09-22')).toBe(false);
  });

  it('needs the anchor for a fortnightly round and counts whole cycles from it', () => {
    const r = { dan_u_nedelji: 1, ciklus_dana: 14, referentni_datum: new Date(2026, 8, 7) };
    expect(landsOn(r, '2026-09-07')).toBe(true);
    expect(landsOn(r, '2026-09-14')).toBe(false);
    expect(landsOn(r, '2026-09-21')).toBe(true);
    expect(landsOn({ ...r, referentni_datum: null }, '2026-09-21')).toBe(false);
  });
});

describe('relevantKontejneri', () => {
  const SADA = new Date('2026-09-19T05:00:00Z');

  function kontejner(over: Partial<KontejnerKandidat> = {}): KontejnerKandidat {
    return {
      kontejnerId: 'k',
      oznaka: 'PI-K',
      tipOtpada: 'komunalni',
      zapreminaL: 1100,
      fillPercent: 10,
      pouzdano: true,
      vremeKriticnog: null,
      imaSenzor: true,
      poslednjePraznjenje: null,
      prijava: null,
      rutinskiDanas: false,
      ciklusDana: null,
      ...over,
    };
  }

  it('drops a container with no signal of its own when a sibling at the same point has a real one', () => {
    const candidate: StopCandidate = {
      sabirnoMestoId: 'sm-1',
      naseljeId: 'n-1',
      naziv: 'Tijabara',
      tacka: { lat: 43.1558, lon: 22.5912 },
      brojDomacinstava: null, // shared terms all zero, so X's own score is exactly 0
      organizovanoPrikupljanje: 'da',
      rizik: null,
      kontejneri: [
        kontejner({ kontejnerId: 'x', oznaka: 'X', fillPercent: 10 }),
        kontejner({ kontejnerId: 'y', oznaka: 'Y', fillPercent: 95 }),
      ],
    };
    const scored = prioritetOf(candidate, DEFAULT_WEIGHTS, SADA);

    const shown = relevantKontejneri(scored, DEFAULT_WEIGHTS.min_odnos);

    expect(shown.map((k) => k.oznaka)).toEqual(['Y']);
  });

  it('never empties out: the container that put the stop on the route stays even below the threshold', () => {
    const candidate: StopCandidate = {
      sabirnoMestoId: 'sm-1',
      naseljeId: 'n-1',
      naziv: 'Rubna tačka',
      tacka: { lat: 43.1558, lon: 22.5912 },
      brojDomacinstava: null,
      organizovanoPrikupljanje: 'da',
      rizik: null,
      kontejneri: [kontejner({ kontejnerId: 'jedini', oznaka: 'JEDINI', fillPercent: 10 })],
    };
    const scored = prioritetOf(candidate, DEFAULT_WEIGHTS, SADA);
    expect(scored.prioritet).toBe(0); // below any real threshold, including min_odnos

    const shown = relevantKontejneri(scored, DEFAULT_WEIGHTS.min_odnos);

    expect(shown.map((k) => k.oznaka)).toEqual(['JEDINI']);
  });
});

describe('RoutingService.generate', () => {
  const SADA = new Date('2026-09-19T05:00:00Z');

  /** Enough of the repository to get one generation through with nothing to plan. */
  function repozitorijum() {
    const prazno: CandidateSources = {
      sabirnaMesta: [],
      kontejneri: [],
      prognoze: [],
      rizici: [],
      prijave: [],
      senzori: new Set<string>(),
      praznjenja: [],
      rasporedi: [],
    };

    const repo = {
      loadCandidateSources: jest.fn(async () => prazno),
      loadActiveVehicles: jest.fn(async () => []),
      insertPlans: jest.fn(async () => []),
      findPlans: jest.fn(async () => []),
      findStops: jest.fn(async () => []),
      withTransaction: jest.fn(async (work: (r: RoutingRepository) => Promise<unknown>) => work(repo)),
    } as unknown as RoutingRepository;

    return repo;
  }

  const optimizer = {
    algoritam: 'test',
    plan: jest.fn(async () => ({ rute: [], nepokriveno: [], preskoceno: [] })),
  };

  it('refreshes stale forecasts before it scores anything', async () => {
    // Without this, a plan can rank a container on a forecast computed before the
    // last collection — the one case where the curve is not merely old but wrong.
    const osveziZastarele = jest.fn(async () => ({ razmatrano: 0, upisano: 0, kriticnoU48h: 0 }));
    const service = new RoutingService(repozitorijum(), optimizer, {
      osveziZastarele,
    } as unknown as ForecastingService);

    await service.generate({ datum: '2026-09-19' }, SADA);

    expect(osveziZastarele).toHaveBeenCalledWith(SADA);
  });
});
