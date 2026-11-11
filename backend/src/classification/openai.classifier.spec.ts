import { ConfigService } from '@nestjs/config';
import { OpenAiClassifier } from './openai.classifier';
import type { KlasifikacijaUlaz } from './classifier.port';

const config = (preko: Record<string, unknown> = {}) =>
  new ConfigService({ OPENAI_API_KEY: 'test-key-0000000000000000', CLASSIFY_TIMEOUT_MS: 5000, ...preko });

const ulaz: KlasifikacijaUlaz = {
  prijava: {
    kratki_kod: 'PR-TEST', kanal: 'web', tip: 'pun_kontejner', opis: 'Preliva se oko kontejnera',
    opis_lokacije: 'Kod skole', velicina: null, preciznost_lokacije: 'gps',
    tacka: { lat: 43.15, lon: 22.58 }, kontejner_id: null,
  },
  fotografije: [{ javni_url: 'https://example.test/foto.jpg', mime_tip: 'image/jpeg' }],
  kontekst: {
    naselje: { naziv: 'Krupac', pokrivenost: 'da' },
    kontejneri: [{ id: 'k-1', oznaka: 'K-102', tip_otpada: 'komunalni', mesto: 'Kod skole', rastojanje_m: 18, punjenje_percent: 91, dana_od_praznjenja: 4 }],
    duplikati: [],
    crna_tacka_m: null,
    kanonska_deponija_m: null,
  },
};

const odgovor = (sadrzaj: unknown, ok = true) =>
  jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify(sadrzaj) } }] }),
    text: () => Promise.resolve('server error'),
  });

const validan = {
  tip: 'prelivanje', podkategorija: 'komunalni_otpad', velicina: 'srednja', tip_obrade: 'odvoz',
  prioritet: 2, kontejner_id: 'k-1', duplikat_od: null, pouzdanost: 0.82,
  obrazlozenje: 'Otpad oko kontejnera na 18 m, kontejner na 91%.',
};

describe('OpenAI klasifikator', () => {
  const original = global.fetch;
  afterEach(() => { global.fetch = original; });

  it('salje shemu, nultu temperaturu i fotografiju', async () => {
    const poziv = odgovor(validan);
    global.fetch = poziv as unknown as typeof fetch;

    await new OpenAiClassifier(config()).klasifikuj(ulaz);

    const [url, opcije] = poziv.mock.calls[0] as [string, { body: string }];
    expect(url).toContain('/chat/completions');
    const telo = JSON.parse(opcije.body) as Record<string, any>;
    expect(telo.temperature).toBe(0);
    expect(telo.response_format.json_schema.strict).toBe(true);
    expect(telo.messages[1].content.some((deo: { type: string }) => deo.type === 'image_url')).toBe(true);
  });

  it('kandidate kontejnera salje sa rastojanjem i punjenjem', async () => {
    const poziv = odgovor(validan);
    global.fetch = poziv as unknown as typeof fetch;

    await new OpenAiClassifier(config()).klasifikuj(ulaz);

    const telo = JSON.parse((poziv.mock.calls[0] as [string, { body: string }])[1].body) as Record<string, any>;
    const tekst = telo.messages[1].content[0].text as string;
    expect(tekst).toContain('id: k-1');
    expect(tekst).toContain('rastojanje: 18 m');
    expect(tekst).toContain('punjenje: 91%');
  });

  it('kontejner bez senzora prijavljuje kao nedostatak podatka, ne kao prazan', async () => {
    // `sensor-telemetry.md`: a missing reading is a gap, never a reassuring 0 %.
    const poziv = odgovor(validan);
    global.fetch = poziv as unknown as typeof fetch;

    await new OpenAiClassifier(config()).klasifikuj({
      ...ulaz,
      kontekst: { ...ulaz.kontekst, kontejneri: [{ ...ulaz.kontekst.kontejneri[0], punjenje_percent: null }] },
    });

    const telo = JSON.parse((poziv.mock.calls[0] as [string, { body: string }])[1].body) as Record<string, any>;
    expect(telo.messages[1].content[0].text).toContain('punjenje: (nema senzora)');
  });

  it('izostavlja fotografije kada je slanje slika iskljuceno', async () => {
    const poziv = odgovor(validan);
    global.fetch = poziv as unknown as typeof fetch;

    await new OpenAiClassifier(config({ CLASSIFY_USE_PHOTOS: false })).klasifikuj(ulaz);

    const telo = JSON.parse((poziv.mock.calls[0] as [string, { body: string }])[1].body) as Record<string, any>;
    expect(telo.messages[1].content).toHaveLength(1);
  });

  it('cita predlog iz strukturiranog odgovora', async () => {
    global.fetch = odgovor(validan) as unknown as typeof fetch;
    const predlog = await new OpenAiClassifier(config()).klasifikuj(ulaz);
    expect(predlog).toMatchObject({ tip: 'prelivanje', tip_obrade: 'odvoz', kontejner_id: 'k-1', pouzdanost: 0.82 });
  });

  it('svodi prioritet i pouzdanost u dozvoljen opseg', async () => {
    global.fetch = odgovor({ ...validan, prioritet: 11, pouzdanost: 4.2 }) as unknown as typeof fetch;
    const predlog = await new OpenAiClassifier(config()).klasifikuj(ulaz);
    expect(predlog.prioritet).toBe(5);
    expect(predlog.pouzdanost).toBe(1);
  });

  it('greska servisa je greska, ne tiho losa klasifikacija', async () => {
    global.fetch = odgovor(validan, false) as unknown as typeof fetch;
    await expect(new OpenAiClassifier(config()).klasifikuj(ulaz)).rejects.toThrow('OpenAI 500');
  });

  it('odbijanje modela ne postaje predlog', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ choices: [{ message: { refusal: 'ne mogu' } }] }),
      text: () => Promise.resolve(''),
    }) as unknown as typeof fetch;

    await expect(new OpenAiClassifier(config()).klasifikuj(ulaz)).rejects.toThrow('odbio klasifikaciju');
  });
});
