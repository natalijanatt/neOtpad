import { RuleClassifier } from './rule.classifier';
import { normalizuj } from './text';
import type { KlasifikacijaUlaz } from './classifier.port';

const ulaz = (opis: string | null, preko: Partial<KlasifikacijaUlaz['prijava']> = {}): KlasifikacijaUlaz => ({
  prijava: {
    kratki_kod: 'PR-TEST', kanal: 'sms', tip: 'drugo', opis, opis_lokacije: null,
    velicina: null, preciznost_lokacije: 'naselje', tacka: null, kontejner_id: null, ...preko,
  },
  fotografije: [],
  kontekst: { naselje: null, kontejneri: [], duplikati: [], crna_tacka_m: null, kanonska_deponija_m: null },
});

describe('normalizacija teksta', () => {
  it('svodi cirilicu, latinicu sa dijakritikama i golu latinicu na isti oblik', () => {
    // The same sentence from a Viber keyboard, a browser and an SMS keypad.
    expect(normalizuj('Прелива се')).toBe('preliva se');
    expect(normalizuj('Preliva še')).toBe('preliva se');
    expect(normalizuj('preliva  se!')).toBe('preliva se');
  });

  it('razdvaja reci na interpunkciji umesto da ih spaja', () => {
    expect(normalizuj('kontejner,pun')).toBe('kontejner pun');
  });
});

describe('klasifikacija po pravilima', () => {
  const klasifikator = new RuleClassifier();

  it('prepoznaje prelivanje i salje ga na odvoz', async () => {
    const predlog = await klasifikator.klasifikuj(ulaz('Smece se preliva oko kontejnera kod skole'));
    expect(predlog.tip).toBe('prelivanje');
    expect(predlog.tip_obrade).toBe('odvoz');
    expect(predlog.podkategorija).toBe('komunalni_otpad');
  });

  it('opasan otpad je hitan i ide na ciscenje, bez obzira sta je gradjanin izabrao', async () => {
    const predlog = await klasifikator.klasifikuj(ulaz('Neko istovario ploce eternita pored puta', { tip: 'pun_kontejner' }));
    expect(predlog.podkategorija).toBe('opasan_otpad');
    expect(predlog.tip).toBe('divlja_deponija');
    expect(predlog.tip_obrade).toBe('ciscenje');
    expect(predlog.prioritet).toBe(1);
  });

  it('zapaljen otpad pretice kontejnerska pravila', async () => {
    // "gori kontejner" is a fire first: the container rule further down the list
    // would have sent it to maintenance.
    const predlog = await klasifikator.klasifikuj(ulaz('Gori kontejner kod ambulante'));
    expect(predlog.podkategorija).toBe('paljenje_otpada');
    expect(predlog.prioritet).toBe(1);
  });

  it('problem van nadleznosti ne nestaje, nego ide na proveru lokacije', async () => {
    const predlog = await klasifikator.klasifikuj(ulaz('Izliva se fekalna kanalizacija u ulici'));
    expect(predlog.podkategorija).toBe('van_nadleznosti');
    expect(predlog.tip_obrade).toBe('provera_lokacije');
  });

  it('deponija bez navedene velicine nije mala', async () => {
    // A crew that arrives with the wrong vehicle drives back empty.
    const predlog = await klasifikator.klasifikuj(ulaz('Bacaju smece u potok kod mosta'));
    expect(predlog.velicina).toBe('srednja');
  });

  it('rec iz opisa pretice velicinu koju je naveo gradjanin', async () => {
    const predlog = await klasifikator.klasifikuj(ulaz('Ogromna gomila, ima je za kamion', { velicina: 'mala' }));
    expect(predlog.velicina).toBe('velika');
  });

  it('nikada ne izmislja kontejner', async () => {
    const predlog = await klasifikator.klasifikuj(ulaz('Kontejner je pun'));
    expect(predlog.kontejner_id).toBeNull();
  });

  it('bez prepoznatih reci zadrzava tip gradjanina i spusta pouzdanost', async () => {
    const predlog = await klasifikator.klasifikuj(ulaz('Nesto cudno se desava', { tip: 'divlja_deponija' }));
    expect(predlog.tip).toBe('divlja_deponija');
    expect(predlog.pouzdanost).toBeLessThanOrEqual(0.3);
  });

  it('prazna prijava daje najnizu pouzdanost', async () => {
    const predlog = await klasifikator.klasifikuj(ulaz(null));
    expect(predlog.pouzdanost).toBe(0.25);
  });

  it('nijedan predlog po pravilima ne prelazi 0.6', async () => {
    const primeri = ['Kontejner je pun', 'azbest pored puta', 'polomljen poklopac', 'grane i lisce'];
    for (const tekst of primeri) {
      const predlog = await klasifikator.klasifikuj(ulaz(tekst));
      expect(predlog.pouzdanost).toBeLessThanOrEqual(0.6);
    }
  });
});
