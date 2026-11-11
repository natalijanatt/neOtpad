import { fitsOneSms, smsLimit } from './news.sms';

describe('one SMS per announcement', () => {
  it('allows 160 characters while the text stays in the GSM-7 alphabet', () => {
    expect(smsLimit('Odvoz u Temskoj je sredom 07-10h.')).toBe(160);
    expect(fitsOneSms('a'.repeat(160))).toBe(true);
    expect(fitsOneSms('a'.repeat(161))).toBe(false);
  });

  // The trap this file exists for: one c turns a 160-character announcement
  // into three messages, priced per settlement.
  it('drops to 70 characters as soon as a Serbian diacritic appears', () => {
    expect(smsLimit('Odvoz u Temskoj je sredom, počinje 22.9.')).toBe(70);
    expect(fitsOneSms(`${'a'.repeat(70)}`)).toBe(true);
    expect(fitsOneSms(`ć${'a'.repeat(69)}`)).toBe(true);
    expect(fitsOneSms(`ć${'a'.repeat(70)}`)).toBe(false);
  });

  it('treats line breaks as ordinary single-byte characters', () => {
    expect(smsLimit('Akcija ciscenja\r\nsubota u 9h')).toBe(160);
  });
});
