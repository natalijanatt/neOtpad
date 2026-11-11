import { toCrnaTacka, toRizik } from './risk.mapper';

describe('toRizik', () => {
  it('keeps every contributing term, so a score can be explained', () => {
    // "Why is this village on the list" is the question the routing objective
    // has to survive. A score with its components dropped cannot answer it.
    const rizik = toRizik({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      subjekat_tip: 'naselje',
      subjekat_id: '11111111-1111-1111-1111-111111111111',
      izracunato_at: new Date('2026-09-18T01:00:00.000Z'),
      skor: '7.250',
      komponente: { prelivanje: 3.5, istorija_deponija: 2.75, bez_pokrivenosti: 1 },
      klasifikacija: 'visok',
    });

    expect(rizik.skor).toBe(7.25);
    expect(rizik.komponente['bez_pokrivenosti']).toBe(1);
  });
});

describe('toCrnaTacka', () => {
  it('keeps the recommendation and its reasoning together', () => {
    const tacka = toCrnaTacka({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      naselje_id: '11111111-1111-1111-1111-111111111111',
      tacka: '0101000020E610000091990B5C1EAB36402F17F19D988D4540',
      kanonska_id: '77777777-7777-7777-7777-777777777777',
      prvi_put: new Date(2020, 4, 12),
      poslednji_put: new Date(2026, 6, 3),
      broj_ponavljanja: 4,
      preporuka: 'dodati_kontejner',
      obrazlozenje: 'ociscena 2021 i 2024, obnovila se oba puta',
      status: 'predlozeno',
      sprovedeno_at: null,
    });

    expect(tacka.prvi_put).toBe('2020-05-12');
    expect(tacka.preporuka).toBe('dodati_kontejner');
    expect(tacka.obrazlozenje).toContain('obnovila se');
  });
});
