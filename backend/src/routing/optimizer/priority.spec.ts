import { prioritetOf } from './priority';
import { DEFAULT_WEIGHTS, type KontejnerKandidat, type StopCandidate } from './route-optimizer.port';

const SADA = new Date('2026-09-19T05:00:00Z');
const HOUR_MS = 3_600_000;

function kontejner(over: Partial<KontejnerKandidat> = {}): KontejnerKandidat {
  return {
    kontejnerId: 'k-1',
    oznaka: 'PI-001',
    tipOtpada: 'komunalni',
    zapreminaL: 1100,
    fillPercent: 40,
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

function kandidat(over: Partial<StopCandidate> = {}): StopCandidate {
  return {
    sabirnoMestoId: 'sm-1',
    naseljeId: 'n-1',
    naziv: 'Krupac - centar',
    tacka: { lat: 43.116, lon: 22.675 },
    brojDomacinstava: null,
    organizovanoPrikupljanje: 'da',
    kontejneri: [kontejner()],
    rizik: null,
    ...over,
  };
}

describe('prioritetOf', () => {
  it('ignores an unreliable fill level entirely', () => {
    const reliable = prioritetOf(kandidat({ kontejneri: [kontejner({ fillPercent: 95 })] }), DEFAULT_WEIGHTS, SADA);
    const faulty = prioritetOf(
      kandidat({ kontejneri: [kontejner({ fillPercent: 95, pouzdano: false })] }),
      DEFAULT_WEIGHTS,
      SADA,
    );

    expect(reliable.kontejneri[0].komponente.prelivanje.vrednost).toBe(1);
    expect(faulty.kontejneri[0].komponente.prelivanje.vrednost).toBe(0);
    expect(faulty.obavezno).toBe(false);
    expect(faulty.ocekivanoPunjenje).toBe(0);
  });

  it('makes a stop mandatory when the forecast reaches critical within 48 hours', () => {
    const soon = new Date(SADA.getTime() + 30 * HOUR_MS);
    const later = new Date(SADA.getTime() + 5 * 24 * HOUR_MS);

    const urgent = prioritetOf(kandidat({ kontejneri: [kontejner({ vremeKriticnog: soon })] }), DEFAULT_WEIGHTS, SADA);
    const relaxed = prioritetOf(kandidat({ kontejneri: [kontejner({ vremeKriticnog: later })] }), DEFAULT_WEIGHTS, SADA);

    expect(urgent.obavezno).toBe(true);
    expect(urgent.razlog).toBe('prelivanje_rizik');
    expect(relaxed.obavezno).toBe(false);
    expect(relaxed.kontejneri[0].komponente.prelivanje.vrednost).toBe(0.2);
  });

  it('makes a reliable reading at 80 % or more mandatory when there is no forecast', () => {
    const at80 = prioritetOf(kandidat({ kontejneri: [kontejner({ fillPercent: 80 })] }), DEFAULT_WEIGHTS, SADA);
    const at79 = prioritetOf(kandidat({ kontejneri: [kontejner({ fillPercent: 79 })] }), DEFAULT_WEIGHTS, SADA);
    expect(at80.obavezno).toBe(true);
    expect(at79.obavezno).toBe(false);
  });

  it('prefers the forecast over the raw fill level when both exist', () => {
    const far = new Date(SADA.getTime() + 10 * 24 * HOUR_MS);
    const scored = prioritetOf(
      kandidat({ kontejneri: [kontejner({ fillPercent: 85, vremeKriticnog: far })] }),
      DEFAULT_WEIGHTS,
      SADA,
    );
    expect(scored.kontejneri[0].komponente.prelivanje.vrednost).toBe(0);
  });

  it('raises a point in a settlement outside organised collection', () => {
    const served = prioritetOf(kandidat({ organizovanoPrikupljanje: 'da' }), DEFAULT_WEIGHTS, SADA);
    const unserved = prioritetOf(kandidat({ organizovanoPrikupljanje: 'ne' }), DEFAULT_WEIGHTS, SADA);
    const unknown = prioritetOf(kandidat({ organizovanoPrikupljanje: 'nepoznato' }), DEFAULT_WEIGHTS, SADA);

    expect(unserved.prioritet).toBeGreaterThan(unknown.prioritet);
    expect(unknown.prioritet).toBeGreaterThan(served.prioritet);
    expect(unserved.kontejneri[0].komponente.pokrivenost.doprinos).toBeCloseTo(DEFAULT_WEIGHTS.pokrivenost);
  });

  it('makes a confirmed report on a container mandatory and names it as the reason', () => {
    const scored = prioritetOf(
      kandidat({ kontejneri: [kontejner({ prijava: { id: 'p-1', tip: 'pun_kontejner' } })] }),
      DEFAULT_WEIGHTS,
      SADA,
    );
    expect(scored.obavezno).toBe(true);
    expect(scored.razlog).toBe('prijava');
  });

  it('treats a black spot as maximum risk, shared by every container at the point', () => {
    // Fill kept above the minimum-fill floor (20 %) — this test is about the
    // risk term, not about whether the container qualifies as a candidate at all.
    const scored = prioritetOf(
      kandidat({
        rizik: { skor: 12, klasifikacija: 'crna_tacka' },
        kontejneri: [kontejner({ kontejnerId: 'a', fillPercent: 30 }), kontejner({ kontejnerId: 'b', fillPercent: 25 })],
      }),
      DEFAULT_WEIGHTS,
      SADA,
    );
    expect(scored.kontejneri[0].komponente.rizik.vrednost).toBe(1);
    expect(scored.kontejneri[1].komponente.rizik.vrednost).toBe(1);
    expect(scored.razlog).toBe('rizik_divlje_deponije');
  });

  it('scores each container by its own schedule and cycle, not the point as a whole', () => {
    const scored = prioritetOf(
      kandidat({
        kontejneri: [
          kontejner({ kontejnerId: 'komunalni', tipOtpada: 'komunalni', rutinskiDanas: true }),
          kontejner({ kontejnerId: 'reciklaza', tipOtpada: 'suvi_reciklabilni', rutinskiDanas: false }),
        ],
      }),
      DEFAULT_WEIGHTS,
      SADA,
    );
    const komunalni = scored.kontejneri.find((k) => k.kontejnerId === 'komunalni')!;
    const reciklaza = scored.kontejneri.find((k) => k.kontejnerId === 'reciklaza')!;
    expect(komunalni.komponente.rutinski.vrednost).toBe(1);
    expect(reciklaza.komponente.rutinski.vrednost).toBe(0);
  });

  it('lets an unsensored container climb with its own collection cycle', () => {
    const daysAgo = (n: number) => new Date(SADA.getTime() - n * 24 * HOUR_MS);
    const fresh = prioritetOf(
      kandidat({ kontejneri: [kontejner({ ciklusDana: 14, imaSenzor: false, poslednjePraznjenje: daysAgo(2) })] }),
      DEFAULT_WEIGHTS,
      SADA,
    );
    const due = prioritetOf(
      kandidat({ kontejneri: [kontejner({ ciklusDana: 14, imaSenzor: false, poslednjePraznjenje: daysAgo(20) })] }),
      DEFAULT_WEIGHTS,
      SADA,
    );
    const never = prioritetOf(
      kandidat({ kontejneri: [kontejner({ imaSenzor: false, poslednjePraznjenje: null })] }),
      DEFAULT_WEIGHTS,
      SADA,
    );

    expect(fresh.kontejneri[0].komponente.bez_senzora.vrednost).toBeCloseTo(2 / 14);
    expect(due.kontejneri[0].komponente.bez_senzora.vrednost).toBe(1);
    expect(never.kontejneri[0].komponente.bez_senzora.vrednost).toBe(1);
    expect(fresh.kontejneri[0].komponente.prelivanje.vrednost).toBe(0);
  });

  it('never calls bez_senzora or domacinstva "rutinski" — that label means an actual schedule match', () => {
    // Due for its cycle but not on a real plan_odvoza schedule row today, and
    // never mandatory: the label must not claim a fixed pickup day exists.
    const daysAgo = (n: number) => new Date(SADA.getTime() - n * 24 * HOUR_MS);
    const bezSenzora = prioritetOf(
      kandidat({ kontejneri: [kontejner({ imaSenzor: false, poslednjePraznjenje: daysAgo(20), fillPercent: null })] }),
      DEFAULT_WEIGHTS,
      SADA,
    );
    expect(bezSenzora.razlog).toBe('bez_senzora');
    expect(bezSenzora.razlog).not.toBe('rutinski');

    // Fill kept above the minimum-fill floor (20 %, see below) so this test is
    // about the domacinstva term, not about whether it's a candidate at all.
    const domacinstva = prioritetOf(
      kandidat({ brojDomacinstava: 2000, kontejneri: [kontejner({ fillPercent: 30 })] }),
      DEFAULT_WEIGHTS,
      SADA,
    );
    expect(domacinstva.razlog).toBe('domacinstva');
    expect(domacinstva.razlog).not.toBe('rutinski');

    // The real thing rutinski means: a plan_odvoza row actually lands today.
    const stvarniRaspored = prioritetOf(kandidat({ kontejneri: [kontejner({ rutinskiDanas: true })] }), DEFAULT_WEIGHTS, SADA);
    expect(stvarniRaspored.razlog).toBe('rutinski');
  });

  it('is "usput" when nothing speaks for the stop', () => {
    const scored = prioritetOf(kandidat({ kontejneri: [kontejner({ fillPercent: 10 })] }), DEFAULT_WEIGHTS, SADA);
    expect(scored.prioritet).toBe(0);
    expect(scored.razlog).toBe('usput');
  });

  it('drives the stop by its worst container while keeping every container scored', () => {
    const scored = prioritetOf(
      kandidat({
        kontejneri: [
          kontejner({ kontejnerId: 'quiet', fillPercent: 10 }),
          kontejner({ kontejnerId: 'critical', fillPercent: 95 }),
        ],
      }),
      DEFAULT_WEIGHTS,
      SADA,
    );

    expect(scored.prioritet).toBe(scored.kontejneri.find((k) => k.kontejnerId === 'critical')!.prioritet);
    expect(scored.kontejneri).toHaveLength(2);
    expect(scored.kontejneri.find((k) => k.kontejnerId === 'quiet')!.prioritet).toBeLessThan(scored.prioritet);
  });

  describe('minimum fill floor', () => {
    it('disqualifies a reliably near-empty container even with a confirmed report and high settlement risk', () => {
      const scored = prioritetOf(
        kandidat({
          rizik: { skor: 90, klasifikacija: 'crna_tacka' },
          organizovanoPrikupljanje: 'ne',
          brojDomacinstava: 500,
          kontejneri: [
            kontejner({
              fillPercent: 19,
              prijava: { id: 'p-1', tip: 'pun_kontejner' },
              rutinskiDanas: true,
            }),
          ],
        }),
        DEFAULT_WEIGHTS,
        SADA,
      );

      expect(scored.prioritet).toBe(0);
      expect(scored.obavezno).toBe(false);
      expect(scored.razlog).toBe('usput');
      expect(Object.values(scored.kontejneri[0].komponente).every((v) => v.vrednost === 0 && v.doprinos === 0)).toBe(true);
    });

    it('is a floor on the current reading, not on a forecast: soon-critical does not exempt a near-empty container', () => {
      const soon = new Date(SADA.getTime() + 5 * HOUR_MS);
      const scored = prioritetOf(kandidat({ kontejneri: [kontejner({ fillPercent: 10, vremeKriticnog: soon })] }), DEFAULT_WEIGHTS, SADA);
      expect(scored.prioritet).toBe(0);
      expect(scored.obavezno).toBe(false);
    });

    it('does not exclude at exactly the floor, only strictly below it', () => {
      const at20 = prioritetOf(kandidat({ kontejneri: [kontejner({ fillPercent: 20 })] }), DEFAULT_WEIGHTS, SADA);
      const at19 = prioritetOf(kandidat({ kontejneri: [kontejner({ fillPercent: 19 })] }), DEFAULT_WEIGHTS, SADA);
      // 20% alone scores 0 on every term too (below the 60% prelivanje step), so
      // the distinction is that it went through normal scoring, not the floor.
      expect(at19.kontejneri[0].komponente.prelivanje).toEqual({ vrednost: 0, doprinos: 0 });
      expect(at20.prioritet).toBe(at19.prioritet);
    });

    it('does not apply to an unreliable reading — the diagnostic-fault rule already zeroes prelivanje, but other terms still count', () => {
      const scored = prioritetOf(
        kandidat({
          kontejneri: [kontejner({ fillPercent: 10, pouzdano: false, prijava: { id: 'p-1', tip: 'ostecen_kontejner' } })],
        }),
        DEFAULT_WEIGHTS,
        SADA,
      );
      expect(scored.komponente.prijava.vrednost).toBe(0.5);
      expect(scored.prioritet).toBeGreaterThan(0);
    });

    it('does not apply when there is no reading at all (unsensored container)', () => {
      const scored = prioritetOf(
        kandidat({ kontejneri: [kontejner({ fillPercent: null, imaSenzor: false, poslednjePraznjenje: null })] }),
        DEFAULT_WEIGHTS,
        SADA,
      );
      expect(scored.komponente.bez_senzora.vrednost).toBe(1);
    });
  });
});
