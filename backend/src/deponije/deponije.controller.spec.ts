import { Test } from '@nestjs/testing';
import { StaffGuard } from '../auth/auth.guard';
import { DeponijeController } from './deponije.controller';
import { DeponijeRepository, type DeponijaRedRow } from './deponije.repository';
import { DeponijeService } from './deponije.service';
import type { DumpQueryDto } from './dto/deponije.dto';

/** `extensions.st_setsrid(st_makepoint(22.675066, 43.116004), 4326)` as pg returns it. */
const TACKA = '0101000020E61000003CA41820D1AC3640431A1538D98E4540';

function red(over: Partial<DeponijaRedRow> = {}): DeponijaRedRow {
  return {
    id: 'eeeeeeee-0001-4000-8000-000000000001',
    kanonski_id: 'K-07',
    naziv: 'Divlja deponija Krupac',
    naselje_id: 'aaaaaaaa-0002-4000-8000-000000000002',
    naselje_naziv: 'Krupac',
    tacka: TACKA,
    geo_preciznost: 'registarska_tacka',
    prvi_put_zabelezena: 2018,
    poslednji_put_zabelezena: 2021,
    godine_evidentirana: [2018, 2020, 2021],
    izvori: ['LPUO', 'SEPA'],
    broj_izvornih_redova: 2,
    broj_opservacija: 2,
    ponovo_se_stvara: 'da',
    broj_prijava: '0',
    poslednja_prijava_at: null,
    status: 'nije prijavljena posle 2018',
    stanje: 'evidentirana',
    aktivna: true,
    spajanje_pouzdanost: 'visoka',
    povrsina_m2: '26332.00',
    zapremina_m3: '150.00',
    kolicina_t: '10.00',
    ociscena_datum: null,
    ...over,
  };
}

const upit = (over: Partial<DumpQueryDto> = {}): DumpQueryDto => ({ page: 1, limit: 100, ...over });

describe('DeponijeController', () => {
  const build = async (repository: Partial<DeponijeRepository>) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DeponijeController],
      providers: [DeponijeService, { provide: DeponijeRepository, useValue: repository }],
    })
      // The guard is exercised by the auth tests; here it would only demand a token.
      .overrideGuard(StaffGuard)
      .useValue({ canActivate: () => true })
      .compile();

    return moduleRef.get(DeponijeController);
  };

  it('returns a page and reports that more exist', async () => {
    // Two rows for a page size of one: the extra row is how hasMore is known.
    const kanonske = jest.fn(async () => [red(), red({ id: 'eeeeeeee-0002-4000-8000-000000000002', kanonski_id: 'K-08' })]);
    const controller = await build({ kanonske });

    const result = await controller.listDumps(upit({ limit: 1 }));

    expect(result.items).toHaveLength(1);
    expect(result.items[0].kanonski_id).toBe('K-07');
    expect(result.hasMore).toBe(true);
  });

  it('decodes the point and keeps its precision flag', async () => {
    const controller = await build({ kanonske: jest.fn(async () => [red()]) });

    const [dump] = (await controller.listDumps(upit())).items;

    expect(dump.lokacija?.lat).toBeCloseTo(43.116004, 5);
    expect(dump.lokacija?.lon).toBeCloseTo(22.675066, 5);
    expect(dump.geo_preciznost).toBe('registarska_tacka');
  });

  it('returns an unlocated dump with a null point rather than a placeholder coordinate', async () => {
    // The Eko Alert default 43.1682819, 22.5956678 is the reporting site, not a
    // place; the register keeps the row and drops the coordinate.
    const controller = await build({ kanonske: jest.fn(async () => [red({ tacka: null, geo_preciznost: 'nepoznato' })]) });

    const [dump] = (await controller.listDumps(upit())).items;

    expect(dump.lokacija).toBeNull();
    expect(dump.geo_preciznost).toBe('nepoznato');
  });

  it('converts the numeric aggregates rather than passing pg strings through', async () => {
    const controller = await build({ kanonske: jest.fn(async () => [red({ ociscena_datum: new Date(2024, 6, 24) })]) });

    const [dump] = (await controller.listDumps(upit())).items;

    expect(dump.povrsina_m2).toBe(26332);
    expect(dump.zapremina_m3).toBe(150);
    expect(dump.kolicina_t).toBe(10);
    // A `date` read through `toISOString` would land on the 23rd in Belgrade.
    expect(dump.ociscena_datum).toBe('2024-07-24');
  });

  it('carries the years and sources the map needs to size and explain a marker', async () => {
    const controller = await build({ kanonske: jest.fn(async () => [red()]) });

    const [dump] = (await controller.listDumps(upit())).items;

    expect(dump.godine_evidentirana).toEqual([2018, 2020, 2021]);
    expect(dump.izvori).toEqual(['LPUO', 'SEPA']);
    expect(dump.ponovo_se_stvara).toBe('da');
  });

  it('carries the reduced state alongside the verbatim status', async () => {
    const controller = await build({
      kanonske: jest.fn(async () => [
        red({ status: 'aktivna (prijavljena i za 2024); evidentirana u LPUO 2021-2031', stanje: 'aktivna', aktivna: true }),
      ]),
    });

    const [dump] = (await controller.listDumps(upit())).items;

    // The prose stays readable; the five-state reduction sits next to it rather
    // than replacing it.
    expect(dump.stanje).toBe('aktivna');
    expect(dump.status).toContain('evidentirana u LPUO');
    expect(dump.aktivna).toBe(true);
  });

  it('passes the filters through to the repository, including sve', async () => {
    const kanonske = jest.fn(async () => []);
    const controller = await build({ kanonske });
    const query = upit({ naselje_id: 'aaaaaaaa-0002-4000-8000-000000000002', sa_lokacijom: true, sve: true });

    await controller.listDumps(query);

    // Which rows count as standing is a SQL predicate, so the controller's whole
    // job here is to hand the query over untouched.
    expect(kanonske).toHaveBeenCalledWith(query);
  });
});
