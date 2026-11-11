import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StaffGuard } from '../auth/auth.guard';
import { ForecastingController } from './forecasting.controller';
import type { Prognoza } from './forecasting.model';
import { ForecastingService } from './forecasting.service';

const KONTEJNER = 'cccccccc-0001-4000-8000-000000000001';

const PROGNOZA: Prognoza = {
  id: 'dddddddd-0001-4000-8000-000000000001',
  kontejner_id: KONTEJNER,
  izracunata_at: new Date('2026-09-19T02:00:00.000Z'),
  horizont_do: new Date('2026-09-26T02:00:00.000Z'),
  ulazni_podaci_do: new Date('2026-09-19T00:00:00.000Z'),
  serija: [
    { t: '2026-09-19T02:00:00.000Z', p10: 30, p50: 32.5, p90: 35 },
    { t: '2026-09-19T08:00:00.000Z', p10: 32, p50: 35, p90: 38 },
  ],
  vreme_kriticnog: new Date('2026-09-22T14:20:00.000Z'),
  ima_rupu: false,
  model_verzija: 'hibrid-v1(prag=95,horizont=168h,korak=6h,k=4)',
  pouzdanost: 'visoka',
};

describe('ForecastingController', () => {
  const build = async (service: Partial<ForecastingService>) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ForecastingController],
      providers: [{ provide: ForecastingService, useValue: service }],
    })
      // The guard has its own tests; here it would only demand a token.
      .overrideGuard(StaffGuard)
      .useValue({ canActivate: () => true })
      .compile();

    return moduleRef.get(ForecastingController);
  };

  it('returns the newest forecast as ISO instants', async () => {
    const controller = await build({ poslednja: jest.fn(async () => PROGNOZA) });

    const result = await controller.forecast(KONTEJNER);

    expect(result.kontejner_id).toBe(KONTEJNER);
    expect(result.prognoza?.vreme_kriticnog).toBe('2026-09-22T14:20:00.000Z');
    expect(result.prognoza?.serija).toHaveLength(2);
    expect(result.prognoza?.pouzdanost).toBe('visoka');
  });

  it('answers with a null forecast for a container that has none', async () => {
    const controller = await build({
      poslednja: jest.fn(async () => null),
      kontejnerPostoji: jest.fn(async () => true),
    });

    await expect(controller.forecast(KONTEJNER)).resolves.toEqual({ kontejner_id: KONTEJNER, prognoza: null });
  });

  it('distinguishes a missing container from a missing forecast', async () => {
    const controller = await build({
      poslednja: jest.fn(async () => null),
      kontejnerPostoji: jest.fn(async () => false),
    });

    await expect(controller.forecast(KONTEJNER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not ask whether the container exists when a forecast was found', async () => {
    const kontejnerPostoji = jest.fn(async () => true);
    const controller = await build({ poslednja: jest.fn(async () => PROGNOZA), kontejnerPostoji });

    await controller.forecast(KONTEJNER);

    expect(kontejnerPostoji).not.toHaveBeenCalled();
  });
});
