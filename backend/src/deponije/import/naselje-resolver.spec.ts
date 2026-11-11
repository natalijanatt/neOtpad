import { NaseljeResolver, normalizeNaselje } from './naselje-resolver';

const SUKOVO = 'aaaaaaaa-0003-4000-8000-000000000003';
const PIROT = 'aaaaaaaa-0001-4000-8000-000000000001';

describe('NaseljeResolver', () => {
  const resolver = new NaseljeResolver([
    { naselje_id: SUKOVO, naziv: 'Sukovo' },
    { naselje_id: PIROT, naziv: 'Pirot' },
    { naselje_id: SUKOVO, naziv: 'selo sukovo' },
  ]);

  it('matches the official spelling', () => {
    expect(resolver.resolve('Sukovo')).toBe(SUKOVO);
  });

  it('matches through the alias table', () => {
    expect(resolver.resolve('selo sukovo')).toBe(SUKOVO);
  });

  it('matches a "selo X" spelling that has no alias row yet', () => {
    expect(resolver.resolve('selo Sukovo')).toBe(SUKOVO);
  });

  it('refuses a row that names three villages at once', () => {
    // Attributing it to Gnjilan would put the waste in a village that may not
    // be holding it.
    expect(resolver.resolve('Gnjilan; Gradašnica; Gradište')).toBeNull();
  });

  it('resolves a multi-name row whose parts all mean the same settlement', () => {
    const sAliasom = new NaseljeResolver([
      { naselje_id: PIROT, naziv: 'Pirot' },
      { naselje_id: PIROT, naziv: 'Kavak' },
    ]);

    expect(sAliasom.resolve('Pirot; Kavak')).toBe(PIROT);
  });

  it('leaves a street address unresolved rather than guessing a settlement', () => {
    expect(resolver.resolve('Ustanička ulica')).toBeNull();
    expect(resolver.resolve('Pirot-grad')).toBeNull();
  });

  it('resolves nothing when two settlements share a normalised name', () => {
    const ambiguous = new NaseljeResolver([
      { naselje_id: SUKOVO, naziv: 'Ržana' },
      { naselje_id: PIROT, naziv: 'Rzana' },
    ]);

    expect(ambiguous.resolve('Ržana')).toBeNull();
  });
});

describe('normalizeNaselje', () => {
  it('folds the diacritics the sources drop at random', () => {
    expect(normalizeNaselje('Poljska Ržana')).toBe(normalizeNaselje('poljska rzana'));
    expect(normalizeNaselje('Crnoklište')).toBe('crnokliste');
  });

  it('folds đ, which carries no combining mark', () => {
    expect(normalizeNaselje('Đurđevo')).toBe('djurdjevo');
  });

  it('collapses the double spaces in scraped names', () => {
    expect(normalizeNaselje('svetozara markovića  Tijabara')).toBe('svetozara markovica tijabara');
  });
});
