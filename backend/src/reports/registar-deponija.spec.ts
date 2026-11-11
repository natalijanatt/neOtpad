import { kanonskaIzPrijave, opservacijaIzPrijave, preciznostZaRegistar } from './registar-deponija';

const prijava = {
  kratki_kod: 'PR-A1B2C3D4E5F6',
  naselje_id: 'aaaaaaaa-0002-4000-8000-000000000002',
  tacka: { lat: 43.116004, lon: 22.675066 },
  preciznost_lokacije: 'gps' as const,
};

describe('preciznostZaRegistar', () => {
  it('never claims a surveyed point for a citizen coordinate', () => {
    expect(preciznostZaRegistar(prijava.tacka)).toBe('geokodirano');
  });

  it('records an SMS report as located nowhere rather than at its village centre', () => {
    // The register's own CHECK ties `nepoznato` to a NULL point, and a
    // substituted centroid is indistinguishable from a real location once it is
    // stored (`docs/data-sources.md`).
    expect(preciznostZaRegistar(null)).toBe('nepoznato');
  });
});

describe('kanonskaIzPrijave', () => {
  it('satisfies the constraint that ties precision to the presence of a point', () => {
    const bezTacke = kanonskaIzPrijave({ ...prijava, tacka: null, preciznost_lokacije: 'naselje' }, 2026);

    expect(bezTacke.tacka).toBeNull();
    expect(bezTacke.geo_preciznost).toBe('nepoznato');
    // The settlement is what an SMS report is worth, and it is kept.
    expect(bezTacke.naselje_id).toBe(prijava.naselje_id);
  });

  it('leaves the import-owned counters at zero', () => {
    const site = kanonskaIzPrijave(prijava, 2026);

    // `import:deponije` overwrites both from the CSV on every run, so anything
    // this path wrote into them would be silently reset.
    expect(site.broj_izvornih_redova).toBe(0);
    expect(site.broj_opservacija).toBe(0);
    expect(site.izvori).toEqual(['PRIJAVA']);
  });

  it('stays on the default map, because nobody has been there yet', () => {
    // `DeponijeRepository`'s STANJE reads the leading clause; `prijavljeno` is
    // not one of the states that take a site off the active list.
    expect(kanonskaIzPrijave(prijava, 2026).status).toMatch(/^prijavljeno/);
  });

  it('names the site by its short code and never by the citizen text', () => {
    expect(kanonskaIzPrijave(prijava, 2026).naziv).toBe('Prijava PR-A1B2C3D4E5F6');
  });
});

describe('opservacijaIzPrijave', () => {
  it('counts one pile, not the registry-style "a dozen dumps near Izvor"', () => {
    expect(opservacijaIzPrijave(prijava, 'prijava', new Date('2026-09-19T10:00:00Z')).broj_deponija).toBe(1);
  });

  it('takes the year from the date it was recorded', () => {
    const zapis = opservacijaIzPrijave(prijava, 'prijava', new Date('2026-09-19T10:00:00Z'));

    expect(zapis.godina).toBe(2026);
    expect(zapis.izvor).toBe('PRIJAVA');
  });

  it('distinguishes the clean-up from the report that preceded it', () => {
    const sanacija = opservacijaIzPrijave(prijava, 'sanacija', new Date('2026-09-19T10:00:00Z'));

    expect(sanacija.tip_dogadjaja).toBe('sanacija');
    expect(sanacija.opis).toContain('resena');
  });
});
