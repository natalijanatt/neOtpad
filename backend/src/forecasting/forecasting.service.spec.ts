import { jeZastarela, type Svezina } from './forecasting.model';
import type {
  DogadjajRow,
  ForecastingRepository,
  NovaPrognoza,
  OcitavanjeRow,
  PraznjenjeRow,
  PripadnostRow,
  StanjeRow,
  SvezinaRow,
} from './forecasting.repository';
import { ForecastingService, grupisi } from './forecasting.service';

const SADA = new Date('2026-09-19T06:00:00Z');
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

describe('jeZastarela', () => {
  const svez = (over: Partial<Svezina> = {}): Svezina => ({
    kontejner_id: 'k-1',
    poslednje_ocitavanje: new Date(SADA.getTime() - HOUR_MS),
    poslednje_praznjenje: new Date(SADA.getTime() - 2 * DAY_MS),
    izracunata_at: new Date(SADA.getTime() - 30 * 60_000),
    ulazni_podaci_do: new Date(SADA.getTime() - HOUR_MS),
    ...over,
  });

  it('is stale when there is no forecast at all', () => {
    expect(jeZastarela(svez({ izracunata_at: null, ulazni_podaci_do: null }), SADA)).toBe(true);
  });

  it('is stale when the container was emptied after the forecast was computed', () => {
    expect(jeZastarela(svez({ poslednje_praznjenje: new Date(SADA.getTime() - 10 * 60_000) }), SADA)).toBe(true);
  });

  it('is stale when a reading arrived after the forecast was computed', () => {
    expect(jeZastarela(svez({ poslednje_ocitavanje: SADA }), SADA)).toBe(true);
  });

  it('is stale once it passes the maximum age even with nothing new', () => {
    const star = new Date(SADA.getTime() - 13 * HOUR_MS);
    expect(jeZastarela(svez({ izracunata_at: star, poslednje_ocitavanje: star, ulazni_podaci_do: star }), SADA)).toBe(true);
  });

  it('stands while nothing new has arrived', () => {
    expect(jeZastarela(svez(), SADA)).toBe(false);
  });

  it('stands for a silent container whose forecast is recent', () => {
    expect(jeZastarela(svez({ poslednje_ocitavanje: null, ulazni_podaci_do: null }), SADA)).toBe(false);
  });
});

describe('grupisi', () => {
  function ocitavanje(satiPre: number, fill: number, kontejnerId = 'k-1'): OcitavanjeRow {
    return {
      kontejner_id: kontejnerId,
      measured_at: new Date(SADA.getTime() - satiPre * HOUR_MS),
      fill_percent_izracunat: fill,
    };
  }

  it('cuts the history at every emptying', () => {
    const ocitavanja = [ocitavanje(30, 60), ocitavanje(24, 75), ocitavanje(18, 5), ocitavanje(12, 20), ocitavanje(6, 35)];
    const praznjenja: PraznjenjeRow[] = [{ kontejner_id: 'k-1', detektovano_at: new Date(SADA.getTime() - 18 * HOUR_MS) }];

    const ciklusi = grupisi(ocitavanja, praznjenja).get('k-1')!;

    expect(ciklusi).toHaveLength(2);
    expect(ciklusi[0].merenja.map((m) => m.fillPercent)).toEqual([60, 75]);
    expect(ciklusi[0].kraj).not.toBeNull();
    expect(ciklusi[1].merenja.map((m) => m.fillPercent)).toEqual([5, 20, 35]);
    expect(ciklusi[1].kraj).toBeNull();
  });

  it('puts the reading that reports the emptying into the new cycle', () => {
    // The generator writes `orientation = emptying` on the step after collection,
    // and that reading already shows the container reset — it belongs after the cut.
    const ocitavanja = [ocitavanje(12, 80), ocitavanje(6, 4)];
    const praznjenja: PraznjenjeRow[] = [{ kontejner_id: 'k-1', detektovano_at: new Date(SADA.getTime() - 6 * HOUR_MS) }];

    const ciklusi = grupisi(ocitavanja, praznjenja).get('k-1')!;

    expect(ciklusi[0].merenja.map((m) => m.fillPercent)).toEqual([80]);
    expect(ciklusi[1].merenja.map((m) => m.fillPercent)).toEqual([4]);
  });

  it('keeps one open cycle when nothing was ever emptied', () => {
    const ciklusi = grupisi([ocitavanje(12, 10), ocitavanje(6, 20)], []).get('k-1')!;

    expect(ciklusi).toHaveLength(1);
    expect(ciklusi[0].kraj).toBeNull();
  });

  it('ignores an emptying older than the first reading in the window', () => {
    const praznjenja: PraznjenjeRow[] = [{ kontejner_id: 'k-1', detektovano_at: new Date(SADA.getTime() - 40 * HOUR_MS) }];

    expect(grupisi([ocitavanje(12, 10), ocitavanje(6, 20)], praznjenja).get('k-1')!).toHaveLength(1);
  });

  it('keeps containers apart', () => {
    const rezultat = grupisi([ocitavanje(12, 10), ocitavanje(6, 20, 'k-2')], []);

    expect([...rezultat.keys()].sort()).toEqual(['k-1', 'k-2']);
  });
});

describe('ForecastingService', () => {
  /** A container filling at 10 pp/day for three days, sampled every six hours. */
  function istorija(kontejnerId: string): OcitavanjeRow[] {
    const rows: OcitavanjeRow[] = [];
    for (let i = 0; i < 12; i++) {
      const satiPre = 72 - i * 6;
      rows.push({
        kontejner_id: kontejnerId,
        measured_at: new Date(SADA.getTime() - satiPre * HOUR_MS),
        fill_percent_izracunat: Math.round(((72 - satiPre) * 10) / 24),
      });
    }
    return rows;
  }

  function repozitorijum(over: Partial<Record<string, unknown>> = {}) {
    const upisano: NovaPrognoza[] = [];
    const fake = {
      upisano,
      svezina: async (): Promise<SvezinaRow[]> => [
        {
          kontejner_id: 'k-1',
          poslednje_ocitavanje: new Date(SADA.getTime() - 6 * HOUR_MS),
          poslednje_praznjenje: null,
          izracunata_at: null,
          ulazni_podaci_do: null,
        },
        {
          kontejner_id: 'k-2',
          poslednje_ocitavanje: new Date(SADA.getTime() - 6 * HOUR_MS),
          poslednje_praznjenje: null,
          izracunata_at: new Date(SADA.getTime() - 5 * 60_000),
          ulazni_podaci_do: new Date(SADA.getTime() - 6 * HOUR_MS),
        },
      ],
      ocitavanja: async (ids: string[]): Promise<OcitavanjeRow[]> => ids.flatMap((id) => istorija(id)),
      praznjenja: async (): Promise<PraznjenjeRow[]> => [],
      stanja: async (ids: string[]): Promise<StanjeRow[]> =>
        ids.map((id) => ({ kontejner_id: id, aktivni_status: ['ok'], tih_od: null })),
      pripadnost: async (ids: string[]): Promise<PripadnostRow[]> =>
        ids.map((id) => ({ kontejner_id: id, naselje_id: 'n-1', mesna_zajednica_id: null })),
      dogadjaji: async (): Promise<DogadjajRow[]> => [],
      upisi: async (rows: NovaPrognoza[]): Promise<void> => {
        upisano.push(...rows);
      },
      ...over,
    };

    return fake as typeof fake & ForecastingRepository;
  }

  it('recomputes only the containers whose forecast no longer stands', async () => {
    const repo = repozitorijum();
    const rezultat = await new ForecastingService(repo).osveziZastarele(SADA);

    expect(rezultat.razmatrano).toBe(1);
    expect(repo.upisano.map((p) => p.kontejner_id)).toEqual(['k-1']);
  });

  it('recomputes everything when asked to, freshness aside', async () => {
    const repo = repozitorijum();
    await new ForecastingService(repo).osveziSve(SADA);

    expect(repo.upisano.map((p) => p.kontejner_id).sort()).toEqual(['k-1', 'k-2']);
  });

  it('writes the curve, the watermark and the model version', async () => {
    const repo = repozitorijum();
    await new ForecastingService(repo).osveziSve(SADA);
    const prognoza = repo.upisano[0];

    expect(prognoza.izracunata_at).toEqual(SADA);
    expect(prognoza.ulazni_podaci_do).toEqual(new Date(SADA.getTime() - 6 * HOUR_MS));
    expect(prognoza.horizont_do).toEqual(new Date(SADA.getTime() + 168 * HOUR_MS));
    expect(prognoza.model_verzija).toContain('hibrid-v1');
    expect(Array.isArray(prognoza.serija)).toBe(true);
  });

  it('writes nothing for a container with no readings', async () => {
    const repo = repozitorijum({ ocitavanja: async (): Promise<OcitavanjeRow[]> => [] });
    const rezultat = await new ForecastingService(repo).osveziSve(SADA);

    expect(rezultat.upisano).toBe(0);
    expect(repo.upisano).toHaveLength(0);
  });

  it('marks a forecast low-confidence when the device carries a fault code', async () => {
    const repo = repozitorijum({
      stanja: async (ids: string[]): Promise<StanjeRow[]> =>
        ids.map((id) => ({ kontejner_id: id, aktivni_status: ['optics_blocked'], tih_od: null })),
    });
    await new ForecastingService(repo).osveziSve(SADA);

    expect(repo.upisano[0].pouzdanost).toBe('niska');
  });

  it('applies a city-wide calendar event to every container', async () => {
    const dogadjaj: DogadjajRow = {
      naselje_id: null,
      mesna_zajednica_id: null,
      datum_pocetka: new Date(SADA.getTime()),
      datum_kraja: new Date(SADA.getTime() + 3 * DAY_MS),
      ocekivani_faktor: '2.00',
    };
    const bez = repozitorijum();
    const sa = repozitorijum({ dogadjaji: async (): Promise<DogadjajRow[]> => [dogadjaj] });

    await new ForecastingService(bez).osveziSve(SADA);
    await new ForecastingService(sa).osveziSve(SADA);

    const krajBez = bez.upisano[0].vreme_kriticnog!;
    const krajSa = sa.upisano[0].vreme_kriticnog!;
    expect(krajSa.getTime()).toBeLessThan(krajBez.getTime());
  });

  it('leaves a container out of a settlement event that is not its own', async () => {
    const repo = repozitorijum({
      dogadjaji: async (): Promise<DogadjajRow[]> => [
        {
          naselje_id: 'n-drugo',
          mesna_zajednica_id: null,
          datum_pocetka: new Date(SADA.getTime()),
          datum_kraja: new Date(SADA.getTime() + 3 * DAY_MS),
          ocekivani_faktor: '3.00',
        },
      ],
    });
    const bez = repozitorijum();

    await new ForecastingService(repo).osveziSve(SADA);
    await new ForecastingService(bez).osveziSve(SADA);

    expect(repo.upisano[0].vreme_kriticnog).toEqual(bez.upisano[0].vreme_kriticnog);
  });
});
