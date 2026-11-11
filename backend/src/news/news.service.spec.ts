import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { NewsService } from './news.service';
import type { NewsRepository } from './news.repository';

const row = {
  id: '66666666-6666-4666-8666-666666666666',
  naslov: 'Izmena rasporeda', sadrzaj: 'Sredom umesto cetvrtkom.', slika_url: null,
  kategorija: 'raspored' as const, naselje_id: null, zakacena: true, sms_tekst: null,
  autor: 'JKP Komunalac Pirot', objavio_korisnik_id: '11111111-1111-4111-8111-111111111111',
  objavljena_at: new Date('2026-09-19T08:00:00.000Z'), azurirana_at: null, verzija: 1,
};

function service(overrides: Partial<Record<keyof NewsRepository, jest.Mock>> = {}) {
  const repository = {
    list: jest.fn().mockResolvedValue([row]),
    find: jest.fn().mockResolvedValue(row),
    findSettlement: jest.fn().mockResolvedValue({ id: 'aaaaaaaa-0002-4000-8000-000000000002' }),
    insert: jest.fn().mockResolvedValue(row),
    update: jest.fn().mockResolvedValue({ ...row, verzija: 2, azurirana_at: new Date('2026-09-19T09:00:00.000Z') }),
    remove: jest.fn().mockResolvedValue({ id: row.id }),
    ...overrides,
  };
  return { service: new NewsService(repository as unknown as NewsRepository), repository };
}

describe('news feed', () => {
  it('reports another page from the extra row the repository fetches', async () => {
    const { service: news } = service({ list: jest.fn().mockResolvedValue([row, row, row]) });
    const page = await news.list({ page: 1, limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
  });

  it('never exposes which staff member published a post', async () => {
    const { service: news } = service();
    const page = await news.list({ page: 1, limit: 25 });
    expect(page.items[0]).not.toHaveProperty('objavio_korisnik_id');
    expect(page.items[0]?.objavljena_at).toBe('2026-09-19T08:00:00.000Z');
  });
});

describe('publishing', () => {
  it('signs the post with the utility when no author is given, and records the actor internally', async () => {
    const { service: news, repository } = service();
    await news.create({ naslov: 'Akcija ciscenja', sadrzaj: 'Subota u 9h.' }, '11111111-1111-4111-8111-111111111111');
    expect(repository.insert).toHaveBeenCalledWith(expect.objectContaining({
      autor: 'JKP Komunalac Pirot', objavio_korisnik_id: '11111111-1111-4111-8111-111111111111', zakacena: false,
    }));
  });

  it('refuses an SMS text that would be charged as two messages', async () => {
    const { service: news, repository } = service();
    // 71 characters, and the first one forces UCS-2.
    const tooLong = `ć${'a'.repeat(70)}`;
    await expect(news.create({ naslov: 'Vest', sadrzaj: 'Tekst.', sms_tekst: tooLong }, 'staff')).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('refuses a post aimed at a settlement that does not exist', async () => {
    const { service: news, repository } = service({ findSettlement: jest.fn().mockResolvedValue(undefined) });
    await expect(news.create({ naslov: 'Vest', sadrzaj: 'Tekst.', naselje_id: 'aaaaaaaa-0002-4000-8000-000000000002' }, 'staff'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(repository.insert).not.toHaveBeenCalled();
  });
});

describe('editing', () => {
  it('rejects an edit carrying a stale version instead of overwriting', async () => {
    const { service: news, repository } = service();
    await expect(news.update(row.id, { verzija: 0 + 5, naslov: 'Novi naslov' })).rejects.toBeInstanceOf(ConflictException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('leaves omitted fields alone and clears the ones explicitly set to null', async () => {
    const { service: news, repository } = service();
    await news.update(row.id, { verzija: 1, slika_url: null });
    expect(repository.update).toHaveBeenCalledWith(row.id, 1, { slika_url: null });
  });

  it('pins a post without touching its content', async () => {
    const { service: news, repository } = service();
    await news.update(row.id, { verzija: 1, zakacena: true });
    expect(repository.update).toHaveBeenCalledWith(row.id, 1, { zakacena: true });
  });

  it('answers 404 for an unknown post rather than pretending it was deleted', async () => {
    const { service: news } = service({ remove: jest.fn().mockResolvedValue(undefined) });
    await expect(news.remove(row.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
