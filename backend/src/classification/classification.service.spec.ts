import { ConfigService } from '@nestjs/config';
import { ClassificationService } from './classification.service';
import type { ClassificationRepository } from './classification.repository';
import type { KandidatKontejner, KlasifikacijaPredlog, KlasifikacijaUlaz } from './classifier.port';
import { RuleClassifier } from './rule.classifier';
import { uporediSaOdlukom } from './ishod';
import { nadleznaSluzba } from './taxonomy';

const kontejner = (preko: Partial<KandidatKontejner> = {}): KandidatKontejner => ({
  id: 'k-1', oznaka: 'K-102', tip_otpada: 'komunalni', mesto: 'Kod skole',
  rastojanje_m: 12, punjenje_percent: 91, dana_od_praznjenja: 3, ...preko,
});

const ulaz = (preko: Partial<KlasifikacijaUlaz['kontekst']> = {}, prijava: Partial<KlasifikacijaUlaz['prijava']> = {}): KlasifikacijaUlaz => ({
  prijava: {
    kratki_kod: 'PR-TEST', kanal: 'web', tip: 'prelivanje', opis: 'Preliva se',
    opis_lokacije: 'Kod skole', velicina: null, preciznost_lokacije: 'gps',
    tacka: { lat: 43.15, lon: 22.58 }, kontejner_id: null, ...prijava,
  },
  fotografije: [],
  kontekst: { naselje: null, kontejneri: [], duplikati: [], crna_tacka_m: null, kanonska_deponija_m: null, ...preko },
});

const predlog = (preko: Partial<KlasifikacijaPredlog> = {}): KlasifikacijaPredlog => ({
  tip: 'prelivanje', podkategorija: 'komunalni_otpad', velicina: 'srednja', tip_obrade: 'odvoz',
  prioritet: 2, kontejner_id: null, duplikat_od: null, pouzdanost: 0.9,
  obrazlozenje: 'Otpad oko kontejnera.', ...preko,
});

const service = new ClassificationService(
  {} as ClassificationRepository,
  new RuleClassifier(),
  new RuleClassifier(),
  new ConfigService({}),
);

describe('uskladjivanje predloga', () => {
  it('prihvata kontejner koji je bio medju ponudjenim kandidatima', () => {
    const rezultat = service.uskladi(predlog({ kontejner_id: 'k-1' }), ulaz({ kontejneri: [kontejner()] }));
    expect(rezultat.kontejner_id).toBe('k-1');
    expect(rezultat.tip_obrade).toBe('odvoz');
    expect(rezultat.pouzdanost).toBe(0.9);
  });

  it('odbacuje izmisljen kontejner i obara pouzdanost', () => {
    // A schema can enforce "a string"; only the candidate list can enforce
    // "a container that exists", and routing acts on this field. Two candidates
    // here so the discarded identifier is not immediately replaced by the
    // lone-candidate rule below - this test is about the dropping.
    const rezultat = service.uskladi(
      predlog({ kontejner_id: 'ne-postoji' }),
      ulaz({ kontejneri: [kontejner(), kontejner({ id: 'k-2', oznaka: 'K-103' })] }),
    );
    expect(rezultat.kontejner_id).toBeNull();
    expect(rezultat.pouzdanost).toBeLessThanOrEqual(0.5);
    expect(rezultat.obrazlozenje).toContain('nije bio medju ponudjenima');
  });

  it('usvaja jedini kandidat koji stoji tu, kada je odvoz predlozen bez kontejnera', () => {
    const rezultat = service.uskladi(predlog(), ulaz({ kontejneri: [kontejner({ rastojanje_m: 12 })] }));
    expect(rezultat.kontejner_id).toBe('k-1');
    expect(rezultat.tip_obrade).toBe('odvoz');
  });

  it('ne usvaja udaljen kontejner, nego trazi proveru lokacije', () => {
    const rezultat = service.uskladi(predlog(), ulaz({ kontejneri: [kontejner({ rastojanje_m: 240 })] }));
    expect(rezultat.kontejner_id).toBeNull();
    expect(rezultat.tip_obrade).toBe('provera_lokacije');
  });

  it('ne bira izmedju vise kandidata', () => {
    const rezultat = service.uskladi(predlog(), ulaz({ kontejneri: [kontejner(), kontejner({ id: 'k-2', oznaka: 'K-103' })] }));
    expect(rezultat.kontejner_id).toBeNull();
  });

  it('spusta na proveru lokacije kada predlozena obrada krsi pravila trijaze', () => {
    // Collection cannot answer an illegal dump, and the API would refuse the
    // triage that a dispatcher built from this proposal.
    const rezultat = service.uskladi(
      predlog({ tip: 'divlja_deponija', tip_obrade: 'odvoz' }),
      ulaz({ kontejneri: [kontejner()] }),
    );
    expect(rezultat.tip_obrade).toBe('provera_lokacije');
    expect(rezultat.obrazlozenje).toContain('proveru lokacije');
  });

  it('veliki problem ne moze na redovan odvoz', () => {
    const rezultat = service.uskladi(
      predlog({ velicina: 'velika', kontejner_id: 'k-1' }),
      ulaz({ kontejneri: [kontejner()] }),
    );
    expect(rezultat.tip_obrade).toBe('provera_lokacije');
  });

  it('zanemaruje duplikat koji nije bio ponudjen', () => {
    const rezultat = service.uskladi(predlog({ duplikat_od: 'p-9', kontejner_id: 'k-1' }), ulaz({ kontejneri: [kontejner()] }));
    expect(rezultat.duplikat_od).toBeNull();
  });

  it('svodi prioritet u dozvoljen opseg', () => {
    const rezultat = service.uskladi(predlog({ prioritet: 9, kontejner_id: 'k-1' }), ulaz({ kontejneri: [kontejner()] }));
    expect(rezultat.prioritet).toBe(5);
  });
});

describe('poredjenje sa odlukom dispecera', () => {
  it('slaganje po tipu i obradi je prihvacena', () => {
    expect(uporediSaOdlukom(
      { predlozeni_tip: 'prelivanje', predlozeni_tip_obrade: 'odvoz' },
      { potvrdjena: true, tip: 'prelivanje', tip_obrade: 'odvoz' },
    )).toBe('prihvacena');
  });

  it('promenjena obrada je izmenjena, ne odbacena', () => {
    expect(uporediSaOdlukom(
      { predlozeni_tip: 'prelivanje', predlozeni_tip_obrade: 'odvoz' },
      { potvrdjena: true, tip: 'prelivanje', tip_obrade: 'ciscenje' },
    )).toBe('izmenjena');
  });

  it('odbijena ili duplikat prijava je odbacen predlog', () => {
    expect(uporediSaOdlukom(
      { predlozeni_tip: 'prelivanje', predlozeni_tip_obrade: 'odvoz' },
      { potvrdjena: false, tip: 'prelivanje', tip_obrade: null },
    )).toBe('odbacena');
  });
});

describe('nadlezna sluzba', () => {
  it('razdvaja ekipu sa mehanizacijom od obicne ekipe', () => {
    expect(nadleznaSluzba('ciscenje', 'gradjevinski_sut')).toContain('mehanizacijom');
    expect(nadleznaSluzba('ciscenje', 'komunalni_otpad')).not.toContain('mehanizacijom');
  });

  it('opasan otpad ne ide ni na jednu od gradskih ekipa', () => {
    expect(nadleznaSluzba('ciscenje', 'opasan_otpad')).toContain('operater');
  });

  it('problem van nadleznosti se prosledjuje, a ne odbija', () => {
    expect(nadleznaSluzba('provera_lokacije', 'van_nadleznosti')).toContain('proslediti');
  });
});
