import type { CsvRow } from '../../common/csv/csv';
import { ImportWarnings } from '../../common/csv/csv-values';
import { mapKanonske, mapLokacije, mapOpservacije } from './deponije-csv';

/**
 * One test per trap in docs/data-sources.md. If one of these starts failing
 * because the scraper changed shape, the right fix is usually the CSV, not the
 * expectation.
 */
describe('deponije CSV mapping', () => {
  let warnings: ImportWarnings;

  beforeEach(() => {
    warnings = new ImportWarnings();
  });

  const kanonska = (overrides: Partial<Record<string, string>> = {}): CsvRow[] => [
    {
      kanonski_id: 'K-01',
      naziv: 'divlja deponija',
      naselje: 'Sukovo',
      lat: '43.048063',
      lon: '22.650082',
      geo_preciznost: 'centroid_naselja',
      prvi_put_zabelezena: '2024',
      poslednji_put_zabelezena: '2024',
      godine_evidentirana: '2024',
      broj_izvornih_redova: '1',
      broj_opservacija: '1',
      izvori: 'EKOALERT',
      ponovo_se_stvara: 'nepoznato',
      status: 'prijavljeno',
      spajanje_pouzdanost: '',
      ...overrides,
    },
  ];

  const lokacija = (overrides: Partial<Record<string, string>> = {}): CsvRow[] => [
    {
      location_id: 'SEPA-01',
      naziv: 'Divlja deponija Krupac',
      naselje: 'Krupac',
      lat: '43.116004',
      lon: '22.675066',
      geo_preciznost: 'registarska_tacka',
      prvi_put_zabelezena: '2018',
      poslednji_put_zabelezena: '2018',
      godine_evidentirana: '2018',
      tip_otpada: 'komunalni (registar ne specificira)',
      povrsina_m2: '300.0',
      zapremina_m3: '',
      kolicina_t: '10.0',
      ciscenja_godisnje: '0',
      ociscena_datum: '',
      ponovo_se_stvara: 'da',
      status: 'nije prijavljena posle 2018',
      izvor: 'SEPA / NRIZ',
      izvor_url: 'https://data.gov.rs/',
      napomena: '',
      kanonski_id: 'K-07',
      spajanje_pouzdanost: 'srednja',
      spajanje_razlog: 'Uzajamno najblizi par',
      katastarska_parcela: '',
      katastarska_opstina: '',
      ...overrides,
    },
  ];

  const opservacija = (overrides: Partial<Record<string, string>> = {}): CsvRow[] => [
    {
      location_id: 'SEPA-01',
      datum: '',
      godina: '2018',
      tip_dogadjaja: 'godisnja_evidencija',
      lat: '43.1160043',
      lon: '22.6750659',
      povrsina_m2: '300.0',
      zapremina_m3: '',
      kolicina_t: '10.0',
      izvor: 'SEPA/NRIZ',
      izvor_url: 'https://data.gov.rs/',
      opis: 'Krupac, Pirot, 732397',
      kanonski_id: 'K-07',
      ...overrides,
    },
  ];

  describe('geo_preciznost', () => {
    it('keeps a surveyed registry point apart from a settlement centroid', () => {
      const [registry] = mapLokacije(lokacija(), warnings);
      const [centroid] = mapLokacije(lokacija({ geo_preciznost: 'centroid_naselja' }), warnings);

      expect(registry!.geo_preciznost).toBe('registarska_tacka');
      expect(centroid!.geo_preciznost).toBe('centroid_naselja');
    });

    it.each(['ulica', 'centar_grada', 'priblizno_naselje', 'priblizno_zona', 'prijava_gradjanina'])(
      'files %s under geokodirano, never as a surveyed point',
      (preciznost) => {
        const [row] = mapLokacije(lokacija({ geo_preciznost: preciznost }), warnings);

        expect(row!.geo_preciznost).toBe('geokodirano');
        expect(row!.tacka).not.toBeNull();
      },
    );

    it('warns and keeps the coordinate when the precision flag is unreadable', () => {
      const [row] = mapLokacije(lokacija({ geo_preciznost: 'satelit' }), warnings);

      expect(row!.geo_preciznost).toBe('geokodirano');
      expect(row!.tacka).toEqual({ lat: 43.116004, lon: 22.675066 });
      expect(warnings.messages.join('\n')).toContain('satelit');
    });
  });

  it('turns the Eko Alert placeholder coordinate into an explicit unknown', () => {
    const [row] = mapKanonske(
      kanonska({ lat: '43.1682819', lon: '22.5956678', geo_preciznost: 'centroid_naselja' }),
      warnings,
    );

    expect(row!.tacka).toBeNull();
    expect(row!.geo_preciznost).toBe('nepoznato');
  });

  it('reads a blank ponovo_se_stvara as an absent answer, not as "ne"', () => {
    const [row] = mapKanonske(kanonska({ ponovo_se_stvara: '' }), warnings);

    expect(row!.ponovo_se_stvara).toBe('nepoznato');
  });

  it('leaves spajanje_pouzdanost NULL when the row was never merged', () => {
    const [row] = mapLokacije(lokacija({ spajanje_pouzdanost: '' }), warnings);

    expect(row!.spajanje_pouzdanost).toBeNull();
  });

  it('splits the year list and the source list on their own separators', () => {
    const [row] = mapKanonske(
      kanonska({ godine_evidentirana: '2021;2020;2020', izvori: 'LPUO | SEPA' }),
      warnings,
    );

    expect(row!.godine_evidentirana).toEqual([2020, 2021]);
    expect(row!.izvori).toEqual(['LPUO', 'SEPA']);
  });

  describe('year columns', () => {
    it('takes the year out of an Eko Alert report date', () => {
      const [row] = mapLokacije(lokacija({ prvi_put_zabelezena: '2023-11-30' }), warnings);

      expect(row!.prvi_put_zabelezena).toBe(2023);
    });

    it('refuses to turn "pre 2004" into a first sighting in 2004', () => {
      const [row] = mapLokacije(
        lokacija({ prvi_put_zabelezena: 'pre 2004', godine_evidentirana: '2004;2019' }),
        warnings,
      );

      expect(row!.prvi_put_zabelezena).toBeNull();
      expect(row!.godine_evidentirana).toEqual([2004, 2019]);
    });
  });

  it('collapses a per-year ciscenja_godisnje list to its maximum', () => {
    const [row] = mapLokacije(lokacija({ ciscenja_godisnje: '0;1' }), warnings);

    expect(row!.ciscenja_godisnje).toBe(1);
    expect(warnings.messages.join('\n')).toContain('collapsed to its maximum 1');
  });

  it('stores a month-only observation date as NULL and keeps the year', () => {
    const [row] = mapOpservacije(opservacija({ datum: '2019-07', godina: '2019' }), warnings);

    expect(row!.datum).toBeNull();
    expect(row!.godina).toBe(2019);
  });

  it('keeps registry prose out of the tip_otpada enum', () => {
    const [row] = mapLokacije(lokacija(), warnings);

    expect(row!.tip_otpada_opis).toBe('komunalni (registar ne specificira)');
  });

  it('counts the Izvor report as the dozen dumps it describes', () => {
    const rows = mapOpservacije(
      opservacija({ location_id: 'EKOALERT-30', opis: 'postoji desetak deponija' }),
      warnings,
    );

    expect(rows[0]!.broj_deponija).toBe(10);
  });

  it('warns when a known multi-dump row disappears from the export', () => {
    mapOpservacije(opservacija(), warnings);

    expect(warnings.messages.join('\n')).toContain('EKOALERT-30');
  });

  it('skips an observation that cannot be placed in time', () => {
    const rows = mapOpservacije(opservacija({ godina: '' }), warnings);

    expect(rows).toHaveLength(0);
    expect(warnings.messages.join('\n')).toContain('godina');
  });
});
