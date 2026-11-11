import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StaffGuard } from '../auth/auth.guard';
import { ContainersController } from './containers.controller';
import { ContainersRepository, type KontejnerRedRow } from './containers.repository';
import { ContainersService } from './containers.service';
import type { ContainerQueryDto } from './dto/containers.dto';

function red(id: string, oznaka: string): KontejnerRedRow {
  return {
    id,
    oznaka,
    tip_otpada: 'komunalni',
    zapremina_l: 1100,
    sabirno_mesto_id: 'bbbbbbbb-0001-4000-8000-000000000001',
    mesto_naziv: 'Krupac - centar sela',
    naselje_id: 'aaaaaaaa-0002-4000-8000-000000000002',
    lat: 43.116004,
    lon: 22.675066,
    ima_senzor: true,
    fill_percent: 40,
    measured_at: new Date('2026-09-19T00:00:00.000Z'),
    trend_pp_po_danu: '12.40',
    baterija_percent: 92,
    aktivni_status: ['ok'],
    tih_od: null,
    poslednje_praznjenje: null,
    prelivanja_90d: '0',
    prognoza_izracunata_at: null,
    prognoza_ulazni_podaci_do: null,
    prognoza_vreme_kriticnog: null,
    prognoza_pouzdanost: null,
    prognoza_ima_rupu: null,
    prognoza_serija: null,
  };
}

const upit = (over: Partial<ContainerQueryDto> = {}): ContainerQueryDto => ({ page: 1, limit: 25, ...over });

describe('ContainersController', () => {
  const build = async (repository: Partial<ContainersRepository>) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContainersController],
      providers: [ContainersService, { provide: ContainersRepository, useValue: repository }],
    })
      // The guard is exercised by the auth tests; here it would only demand a token.
      .overrideGuard(StaffGuard)
      .useValue({ canActivate: () => true })
      .compile();

    return moduleRef.get(ContainersController);
  };

  it('returns a page and reports that more exist', async () => {
    // Two rows for a page size of one: the extra row is how hasMore is known.
    const page = jest.fn(async () => [red('c-1', 'PI-KRU-001'), red('c-2', 'PI-KRU-002')]);
    const controller = await build({ page });

    const result = await controller.list(upit({ limit: 1 }));

    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(true);
    expect(result.items[0].naziv).toBe('PI-KRU-001');
  });

  it('keeps the reference shape when sa_stanjem is not asked for', async () => {
    const controller = await build({ page: jest.fn(async () => [red('c-1', 'PI-KRU-001')]) });

    const [item] = (await controller.list(upit())).items;

    expect(Object.keys(item).sort()).toEqual(['id', 'naselje_id', 'naziv']);
  });

  it('passes the filters through to the repository', async () => {
    const page = jest.fn(async () => []);
    const controller = await build({ page });
    const query = upit({ sa_stanjem: true, samo_sa_senzorom: true, min_fill: 80, kriticno_do: '2026-09-21T06:00:00.000Z' });

    await controller.list(query);

    expect(page).toHaveBeenCalledWith(query);
  });

  it('returns one container with its state', async () => {
    const controller = await build({ byId: jest.fn(async () => red('c-1', 'PI-KRU-001')) });

    const item = await controller.get('c-1');

    expect(item.stanje?.fill_percent).toBe(40);
    expect(item.lokacija).toEqual({ lat: 43.116004, lon: 22.675066 });
  });

  it('404s for a container that does not exist', async () => {
    const controller = await build({ byId: jest.fn(async () => undefined) });

    await expect(controller.get('c-x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns readings oldest first', async () => {
    const ocitavanja = jest.fn(async () => [
      { measured_at: new Date('2026-09-18T00:00:00.000Z'), fill_percent_izracunat: 30, pouzdano: true, orientation: 'upright', battery_percent: 92 },
      { measured_at: new Date('2026-09-19T00:00:00.000Z'), fill_percent_izracunat: 40, pouzdano: true, orientation: 'upright', battery_percent: 92 },
    ]);
    const controller = await build({ byId: jest.fn(async () => red('c-1', 'PI-KRU-001')), ocitavanja });

    const readings = await controller.readings('c-1', { dana: 14, limit: 200 });

    expect(readings.map((r) => r.fill_percent)).toEqual([30, 40]);
  });

  it('404s for readings of a container that does not exist, rather than an empty list', async () => {
    // An empty list is a real answer for a container with no sensor, so the two
    // cases must not collapse into the same response.
    const controller = await build({ byId: jest.fn(async () => undefined), ocitavanja: jest.fn(async () => []) });

    await expect(controller.readings('c-x', { dana: 14, limit: 200 })).rejects.toBeInstanceOf(NotFoundException);
  });
});
