import type { CsvRow } from '../../common/csv/csv';
import { ImportWarnings } from '../../common/csv/csv-values';
import { mapNaselja, mapRaspored } from './naselja-csv';

describe('naselja CSV mapping', () => {
  let warnings: ImportWarnings;

  beforeEach(() => {
    warnings = new ImportWarnings();
  });

  const naselje = (overrides: Partial<Record<string, string>> = {}): CsvRow[] => [
    {
      naziv: 'Krupac',
      naziv_u_lpuo: '',
      sifra_mesta: '732397',
      lat: '43.122175',
      lon: '22.672364',
      geo_izvor: 'OSM/administrative',
      kategorija_lpuo: 'I',
      organizovano_prikupljanje: 'da',
      pokrivenost_izvor: 'JP Komunalac Pirot, Program poslovanja za 2018, str. 9',
      pokrivenost_izvor_url: 'http://www.komunalacpirot.rs/',
      pokrivenost_godina: '2018',
      odvoz_nedeljno: '2',
      broj_stanovnika_2011: '1301',
      broj_domacinstava: '441',
      broj_kontejnera_1100l: '28',
      ...overrides,
    },
  ];

  const raspored = (overrides: Partial<Record<string, string>> = {}): CsvRow[] => [
    {
      zona: '',
      naselje: 'Krupac',
      tip_otpada: 'suvi_reciklabilni',
      dan_u_nedelji: '3',
      ciklus_dana: '28',
      referentni_datum: '2026-01-14',
      grupa: 'sreda-3-26-1',
      izvor: 'JP Komunalac Pirot, Raspored pražnjenja plavih kanti 2026',
      izvor_url: 'https://www.komunalacpirot.rs/',
      napomena: '',
      ...overrides,
    },
  ];

  it('keeps the coverage flag together with the document it came from', () => {
    const [row] = mapNaselja(naselje(), warnings);

    expect(row!.organizovano_prikupljanje).toBe('da');
    expect(row!.pokrivenost).toMatchObject({
      godina: 2018,
      odvoz_nedeljno: 2,
      broj_kontejnera_1100l: 28,
    });
  });

  it('records no coverage at all when no document is named', () => {
    // A coverage row with no source is worse than none: it reads as established.
    const [row] = mapNaselja(naselje({ pokrivenost_izvor: '', pokrivenost_godina: '' }), warnings);

    expect(row!.pokrivenost).toBeNull();
  });

  it('treats an unreadable coverage value as not established, not as "no"', () => {
    const [row] = mapNaselja(naselje({ organizovano_prikupljanje: 'možda' }), warnings);

    expect(row!.organizovano_prikupljanje).toBe('nepoznato');
    expect(warnings.messages.join('\n')).toContain('možda');
  });

  it('skips a settlement with no centroid rather than inventing one', () => {
    const rows = mapNaselja(naselje({ lat: '', lon: '' }), warnings);

    expect(rows).toHaveLength(0);
    expect(warnings.messages.join('\n')).toContain('no centroid');
  });

  describe('schedule', () => {
    it('keeps the four-week cycle the villages actually get', () => {
      const [row] = mapRaspored(raspored(), warnings);

      expect(row).toMatchObject({ dan_u_nedelji: 3, ciklus_dana: 28, referentni_datum: '2026-01-14' });
    });

    it('refuses a cycle longer than a week with no date to anchor it', () => {
      // "Every second Monday" has two readings and one of them is a wasted trip.
      const rows = mapRaspored(raspored({ referentni_datum: '' }), warnings);

      expect(rows).toHaveLength(0);
      expect(warnings.messages.join('\n')).toContain('referentni_datum');
    });

    it('refuses a reference date that falls on another weekday', () => {
      const rows = mapRaspored(raspored({ referentni_datum: '2026-01-15' }), warnings);

      expect(rows).toHaveLength(0);
      expect(warnings.messages.join('\n')).toContain('not a 3');
    });

    it('keeps a street as a zone under its settlement', () => {
      const [row] = mapRaspored(
        raspored({ zona: 'NIKOLE PAŠIĆA', naselje: 'Pirot', ciklus_dana: '14', referentni_datum: '2026-01-14' }),
        warnings,
      );

      expect(row).toMatchObject({ naselje: 'Pirot', zona: 'NIKOLE PAŠIĆA' });
    });
  });
});
