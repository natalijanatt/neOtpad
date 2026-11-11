import { toE164Serbia } from './phone';

describe('toE164Serbia', () => {
  it('stores every usual spelling of one number the same way', () => {
    for (const written of ['064 123 4567', '064/123-45-67', '+381 64 123 4567', '00381641234567', '381641234567']) {
      expect(toE164Serbia(written)).toBe('+381641234567');
    }
  });

  it('accepts a Pirot landline', () => {
    expect(toE164Serbia('010 123 456')).toBe('+38110123456');
  });

  it('rejects what is not a Serbian number', () => {
    expect(toE164Serbia('12345')).toBeNull();
    expect(toE164Serbia('+49 30 1234567')).toBeNull();
    expect(toE164Serbia('064 abc')).toBeNull();
  });
});
