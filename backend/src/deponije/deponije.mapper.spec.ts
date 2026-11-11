import type { Selectable } from 'kysely';
import type { DB } from '../database/generated/schema';
import { toDeponijaKanonska, toDeponijaOpservacija } from './deponije.mapper';

const kanonska = (
  over: Partial<Selectable<DB['app.deponija_kanonska']>> = {},
): Selectable<DB['app.deponija_kanonska']> => ({
  id: '77777777-7777-7777-7777-777777777777',
  kanonski_id: 'K-04',
  naziv: 'Mali Jovanovac',
  naselje_id: '11111111-1111-1111-1111-111111111111',
  tacka: '0101000020E610000091990B5C1EAB36402F17F19D988D4540',
  geo_preciznost: 'centroid_naselja',
  prvi_put_zabelezena: 2020,
  poslednji_put_zabelezena: 2021,
  godine_evidentirana: [2020, 2021],
  izvori: ['LPUO'],
  broj_izvornih_redova: 1,
  broj_opservacija: 1,
  ponovo_se_stvara: 'da',
  status: 'evidentirana u LPUO 2021-2031',
  spajanje_pouzdanost: null,
  ...over,
});

describe('toDeponijaKanonska', () => {
  it('decodes a recorded location', () => {
    const deponija = toDeponijaKanonska(kanonska());

    expect(deponija.tacka!.lat).toBeCloseTo(43.10622, 5);
  });

  it('leaves an unknown location unmapped instead of inventing a coordinate', () => {
    // The Eko Alert default coordinate means "nobody wrote down where this is".
    // A map that draws it puts a dump on an arbitrary street.
    const nepoznata = toDeponijaKanonska(kanonska({ tacka: null, geo_preciznost: 'nepoznato' }));

    expect(nepoznata.tacka).toBeNull();
    expect(nepoznata.geo_preciznost).toBe('nepoznato');
  });

  it('keeps the years of evidence, which are what a recurrence claim rests on', () => {
    expect(toDeponijaKanonska(kanonska()).godine_evidentirana).toEqual([2020, 2021]);
  });
});

describe('toDeponijaOpservacija', () => {
  it('keeps the year when the source gave no day', () => {
    const opservacija = toDeponijaOpservacija({
      id: '88888888-8888-8888-8888-888888888888',
      lokacija_id: null,
      kanonska_id: '77777777-7777-7777-7777-777777777777',
      prijava_id: null,
      datum: null,
      godina: 2021,
      tip_dogadjaja: 'strateski_dokument',
      tacka: null,
      povrsina_m2: '31361.0',
      zapremina_m3: '150.0',
      kolicina_t: null,
      broj_deponija: 12,
      izvor: 'LPUO',
      izvor_url: null,
      opis: 'desetak deponija oko Izvora',
    });

    expect(opservacija.datum).toBeNull();
    expect(opservacija.godina).toBe(2021);
    expect(opservacija.povrsina_m2).toBe(31361);
    // One row, twelve dumps: every count off this table is a lower bound.
    expect(opservacija.broj_deponija).toBe(12);
  });
});
