import { hashPassword, verifyPassword } from './password';

describe('staff passwords', () => {
  it('uses unique salts and verifies without storing plaintext', async () => {
    const password = 'a-strong-example-password';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword('incorrect-password', first)).toBe(false);
    expect(await verifyPassword(password, 'malformed')).toBe(false);
  });
});
