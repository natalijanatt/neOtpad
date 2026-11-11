import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DEFAULT_CONTACT } from './default-contact';
import { DisposalService } from './disposal.service';
import type { CollectorsRepository } from './collectors.repository';
import type { SitesRepository } from './sites.repository';
import type { WasteClassifier } from './classifier/waste-classifier.port';

const row = { id: '5eed4000-0001-4000-8000-000000000001', ime: 'Dragan', prezime: 'Stojanović', telefon_e164: '+381600000001', materijali: ['metal' as const] };

function setup(materijal: 'metal' | 'iverica' | null) {
  const collectors = {
    findByMaterijal: jest.fn().mockResolvedValue([row]),
    list: jest.fn().mockResolvedValue([row]),
    insert: jest.fn().mockResolvedValue(row),
    remove: jest.fn().mockResolvedValue({ id: row.id }),
  };
  const classifier: WasteClassifier = { classify: jest.fn().mockResolvedValue({ materijal, izvor: 'openai' }) };
  const sites = { list: jest.fn().mockResolvedValue([]) };
  return { service: new DisposalService(collectors as unknown as CollectorsRepository, sites as unknown as SitesRepository, classifier), collectors };
}

describe('suggest', () => {
  it('lists the collectors for the recognised material, with the default contact', async () => {
    const { service, collectors } = setup('metal');
    const answer = await service.suggest('staro gvozdje');
    expect(collectors.findByMaterijal).toHaveBeenCalledWith('metal');
    expect(answer).toEqual({
      upit: 'staro gvozdje',
      materijal: 'metal',
      izvor: 'openai',
      sakupljaci: [{ id: row.id, ime: 'Dragan', prezime: 'Stojanović', telefon: '+381600000001', materijali: ['metal'] }],
      kontakt: DEFAULT_CONTACT,
    });
  });

  it('still gives the default contact when nothing was recognised', async () => {
    const { service, collectors } = setup(null);
    const answer = await service.suggest('zdravo');
    expect(collectors.findByMaterijal).not.toHaveBeenCalled();
    expect(answer.sakupljaci).toEqual([]);
    expect(answer.kontakt).toBe(DEFAULT_CONTACT);
  });

  it('never exposes the storage column name in the response', async () => {
    const { service } = setup('metal');
    expect((await service.suggest('lim')).sakupljaci[0]).not.toHaveProperty('telefon_e164');
  });
});

describe('collectors', () => {
  const input = { ime: 'Dragan', prezime: 'Stojanović', telefon: '064 123 4567', materijali: ['metal' as const] };

  it('stores the phone normalised to E.164', async () => {
    const { service, collectors } = setup(null);
    await service.create(input);
    expect(collectors.insert).toHaveBeenCalledWith(expect.objectContaining({ telefon_e164: '+381641234567' }));
  });

  it('refuses a number that is not Serbian before touching the database', async () => {
    const { service, collectors } = setup(null);
    await expect(service.create({ ...input, telefon: '+49 30 1234567' })).rejects.toBeInstanceOf(BadRequestException);
    expect(collectors.insert).not.toHaveBeenCalled();
  });

  it('answers 409 when the phone already belongs to a collector', async () => {
    const { service, collectors } = setup(null);
    collectors.insert.mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' }));
    await expect(service.create(input)).rejects.toBeInstanceOf(ConflictException);
  });

  it('answers 404 when removing a collector that is not there', async () => {
    const { service, collectors } = setup(null);
    collectors.remove.mockResolvedValue(undefined);
    await expect(service.remove(row.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
