import { toId, toIsoDate, toNumber, toNumberOrNull } from './row-values';

describe('toNumber', () => {
  it('reads the string pg delivers for a numeric column', () => {
    expect(toNumber('12.50')).toBe(12.5);
  });

  it('refuses a value that is not a number rather than returning NaN', () => {
    expect(() => toNumber('n/a')).toThrow(/not a number/);
  });

  it('keeps null distinguishable from zero', () => {
    expect(toNumberOrNull(null)).toBeNull();
    expect(toNumberOrNull('0')).toBe(0);
  });
});

describe('toIsoDate', () => {
  it('keeps the day pg parsed, not the UTC day', () => {
    // pg parses a `date` at local midnight. In Belgrade toISOString() on this
    // value reads 2024-06-09, which is the bug this helper exists to prevent.
    expect(toIsoDate(new Date(2024, 5, 10))).toBe('2024-06-10');
  });

  it('trims a timestamp string down to its date', () => {
    expect(toIsoDate('2024-06-10T22:00:00.000Z')).toBe('2024-06-10');
  });
});

describe('toId', () => {
  it('keeps a bigserial id exact instead of rounding it into a double', () => {
    expect(toId('9007199254740993')).toBe('9007199254740993');
  });
});
