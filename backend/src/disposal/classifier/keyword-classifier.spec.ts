import { classifyByKeywords, normalize } from './keyword-classifier';

describe('normalize', () => {
  it('meets Cyrillic, Latin with diacritics and Latin without on one form', () => {
    expect(normalize('Фрижидер')).toBe('frizider');
    expect(normalize('frižider')).toBe('frizider');
    expect(normalize('Gvožđe, ŠUT!')).toBe('gvozdje sut');
  });
});

describe('classifyByKeywords', () => {
  it('reads the phrasing people actually use', () => {
    expect(classifyByKeywords('stari frizider')).toBe('elektronski');
    expect(classifyByKeywords('Стара гвожђурија из гараже')).toBe('metal');
    expect(classifyByKeywords('stara zeljezna ograda')).toBe('metal');
    expect(classifyByKeywords('kuhinjski elementi od univera')).toBe('iverica');
    expect(classifyByKeywords('cebad i jorgan')).toBe('tekstil');
  });

  it('files an appliance as e-waste even though it is metal', () => {
    expect(classifyByKeywords('ves masina crkla')).toBe('elektronski');
  });

  it('prefers the collector material over the generic bulky category', () => {
    expect(classifyByKeywords('ormar od iverice')).toBe('iverica');
    expect(classifyByKeywords('stari ormar')).toBe('kabasti');
  });

  it('lets the adjective decide between plastic and glass bottles', () => {
    expect(classifyByKeywords('plasticne flase')).toBe('plastika');
    expect(classifyByKeywords('flase od rakije')).toBe('staklo');
  });

  // The stems that would misfire as prefixes are whole-word only.
  it('does not mistake lemon peel for scrap metal or "tomorrow" for rubble', () => {
    expect(classifyByKeywords('kora od limuna')).toBeNull();
    expect(classifyByKeywords('lim sa krova')).toBe('metal');
    expect(classifyByKeywords('kako je vreme sutra')).toBeNull();
    expect(classifyByKeywords('sut od kupatila')).toBe('gradjevinski');
  });

  it('answers null rather than guessing when nothing matches', () => {
    expect(classifyByKeywords('zdravo')).toBeNull();
  });
});
