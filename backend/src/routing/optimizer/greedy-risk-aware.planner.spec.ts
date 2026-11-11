import { HaversineRoadDistance } from './distance.port';
import { GreedyRiskAwarePlanner } from './greedy-risk-aware.planner';
import {
  DEFAULT_PARAMETERS,
  DEFAULT_WEIGHTS,
  type KontejnerKandidat,
  type StopCandidate,
  type VehicleCapacity,
} from './route-optimizer.port';

const SADA = new Date('2026-09-19T05:00:00Z');
const DATUM = new Date('2026-09-19T00:00:00');
const HOUR_MS = 3_600_000;

/** JKP base in Pirot's industrial zone. */
const DEPO = { lat: 43.1462, lon: 22.6085 };

function vozilo(over: Partial<VehicleCapacity> = {}): VehicleCapacity {
  return { id: 'v-1', oznaka: 'PI 001-AA', kapacitetM3: 10, depo: DEPO, ...over };
}

function kontejner(over: Partial<KontejnerKandidat> = {}): KontejnerKandidat {
  return {
    kontejnerId: 'k',
    oznaka: 'PI-K',
    tipOtpada: 'komunalni',
    zapreminaL: 1100,
    fillPercent: 20,
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

function kandidat(id: string, lat: number, lon: number, over: Partial<StopCandidate> = {}): StopCandidate {
  return {
    sabirnoMestoId: id,
    naseljeId: `n-${id}`,
    naziv: id,
    tacka: { lat, lon },
    brojDomacinstava: null,
    organizovanoPrikupljanje: 'da',
    kontejneri: [kontejner({ kontejnerId: `k-${id}` })],
    rizik: null,
    ...over,
  };
}

const planner = () => new GreedyRiskAwarePlanner(new HaversineRoadDistance());

describe('GreedyRiskAwarePlanner', () => {
  it('serves a remote must-visit stop and skips a near-empty one next door', async () => {
    // Dojkinci is ~35 km of mountain road from the depot; a container forecast to
    // overflow tomorrow lives there. A 20 % container sits 2 km from the depot.
    const remote = kandidat('dojkinci', 43.0011, 22.8556, {
      kontejneri: [kontejner({ vremeKriticnog: new Date(SADA.getTime() + 20 * HOUR_MS) })],
    });
    const near = kandidat('grad', 43.155, 22.59);

    const out = await planner().plan({
      datum: DATUM,
      sada: SADA,
      vozila: [vozilo()],
      kandidati: [near, remote],
      tezine: DEFAULT_WEIGHTS,
      parametri: DEFAULT_PARAMETERS,
    });

    const ids = out.rute[0].stajalista.map((s) => s.kandidat.sabirnoMestoId);
    expect(ids).toContain('dojkinci');
    expect(ids).not.toContain('grad');
    expect(out.nepokriveno).toEqual([]);
    expect(out.preskoceno.map((c) => c.sabirnoMestoId)).toEqual(['grad']);
    expect(out.rute[0].stajalista[0].kandidat.razlog).toBe('prelivanje_rizik');
  });

  it('takes a cheap optional stop that lies on the way', async () => {
    const remote = kandidat('dojkinci', 43.0011, 22.8556, {
      kontejneri: [kontejner({ fillPercent: 95 })],
    });
    // Half-full, a few hundred metres off the road to Dojkinci.
    const onTheWay = kandidat('usput', 43.08, 22.72, { kontejneri: [kontejner({ fillPercent: 65 })] });

    const out = await planner().plan({
      datum: DATUM,
      sada: SADA,
      vozila: [vozilo()],
      kandidati: [remote, onTheWay],
      tezine: DEFAULT_WEIGHTS,
      parametri: DEFAULT_PARAMETERS,
    });

    // Out-and-back on a symmetric matrix: either order is the same length.
    expect(out.rute[0].stajalista.map((s) => s.kandidat.sabirnoMestoId).sort()).toEqual(['dojkinci', 'usput']);
    expect(out.preskoceno).toEqual([]);
  });

  it('reports a must-visit stop the fleet cannot carry instead of dropping it', async () => {
    const heavy = (id: string) =>
      kandidat(id, 43.12, 22.62, {
        kontejneri: [kontejner({ kontejnerId: id, zapreminaL: 5000, fillPercent: 95 })],
      });

    const out = await planner().plan({
      datum: DATUM,
      sada: SADA,
      // 5 m³ × 0.95 ÷ 3 ≈ 1.58 m³ per stop; a 3 m³ body takes one, not two.
      vozila: [vozilo({ kapacitetM3: 3 })],
      kandidati: [heavy('a'), heavy('b')],
      tezine: DEFAULT_WEIGHTS,
      parametri: DEFAULT_PARAMETERS,
    });

    expect(out.rute[0].stajalista).toHaveLength(1);
    expect(out.nepokriveno).toHaveLength(1);
    expect(out.nepokriveno[0].razlog).toBe('kapacitet');
  });

  it('blames the working day when the load would fit but the hours do not', async () => {
    const remote = kandidat('dojkinci', 43.0011, 22.8556, { kontejneri: [kontejner({ fillPercent: 95 })] });

    const out = await planner().plan({
      datum: DATUM,
      sada: SADA,
      vozila: [vozilo()],
      kandidati: [remote],
      tezine: DEFAULT_WEIGHTS,
      parametri: { ...DEFAULT_PARAMETERS, radno_vreme_min: 30 },
    });

    expect(out.rute[0].stajalista).toEqual([]);
    expect(out.nepokriveno[0].razlog).toBe('radno_vreme');
  });

  it('starts and ends every route at its own depot and keeps the clock running', async () => {
    const depoB = { lat: 43.05, lon: 22.65 };
    const stops = [
      kandidat('a', 43.16, 22.60, { kontejneri: [kontejner({ fillPercent: 92 })] }),
      kandidat('b', 43.04, 22.66, { kontejneri: [kontejner({ fillPercent: 92 })] }),
    ];

    const out = await planner().plan({
      datum: DATUM,
      sada: SADA,
      vozila: [vozilo({ id: 'v-a' }), vozilo({ id: 'v-b', oznaka: 'PI 002-AA', depo: depoB })],
      kandidati: stops,
      tezine: DEFAULT_WEIGHTS,
      parametri: DEFAULT_PARAMETERS,
    });

    for (const ruta of out.rute) {
      expect(ruta.putanja[0]).toEqual(ruta.vozilo.depo);
      expect(ruta.putanja[ruta.putanja.length - 1]).toEqual(ruta.vozilo.depo);
      expect(ruta.putanja).toHaveLength(ruta.stajalista.length + 2);
      for (let i = 1; i < ruta.stajalista.length; i++) {
        expect(ruta.stajalista[i].planiraniDolazak.getTime()).toBeGreaterThan(
          ruta.stajalista[i - 1].planiraniDolazak.getTime(),
        );
      }
      for (const s of ruta.stajalista) {
        expect(s.doprinosCeniMin).toBeGreaterThan(0);
        expect(s.planiraniDolazak.getTime()).toBeGreaterThan(DATUM.getTime());
      }
    }
    // Each stop went to the truck whose depot is next to it.
    const byVehicle = Object.fromEntries(out.rute.map((r) => [r.vozilo.id, r.stajalista.map((s) => s.kandidat.sabirnoMestoId)]));
    expect(byVehicle['v-a']).toEqual(['a']);
    expect(byVehicle['v-b']).toEqual(['b']);
  });

  it('fills a shared depot fleet in a fixed order instead of scattering stops', async () => {
    const out = await planner().plan({
      datum: DATUM,
      sada: SADA,
      vozila: [vozilo({ id: 'v-1' }), vozilo({ id: 'v-2', oznaka: 'PI 002-AA' })],
      kandidati: [
        kandidat('a', 43.155, 22.59, { kontejneri: [kontejner({ fillPercent: 92 })] }),
        kandidat('b', 43.156, 22.592, { kontejneri: [kontejner({ fillPercent: 91 })] }),
      ],
      tezine: DEFAULT_WEIGHTS,
      parametri: DEFAULT_PARAMETERS,
    });

    expect(out.rute[0].stajalista).toHaveLength(2);
    expect(out.rute[1].stajalista).toHaveLength(0);
  });

  it('lists every mandatory stop as uncovered when there is no vehicle', async () => {
    const out = await planner().plan({
      datum: DATUM,
      sada: SADA,
      vozila: [],
      kandidati: [kandidat('a', 43.16, 22.6, { kontejneri: [kontejner({ fillPercent: 92 })] })],
      tezine: DEFAULT_WEIGHTS,
      parametri: DEFAULT_PARAMETERS,
    });

    expect(out.rute).toEqual([]);
    expect(out.nepokriveno[0].razlog).toBe('nema_vozila');
  });
});
