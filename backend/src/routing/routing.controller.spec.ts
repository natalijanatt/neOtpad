import { Test } from '@nestjs/testing';
import { DEFAULT_PARAMETERS, DEFAULT_WEIGHTS } from './optimizer/route-optimizer.port';
import type { RoutePlanDto } from './dto/route-plan.dto';
import { RoutingController } from './routing.controller';
import { RoutingService } from './routing.service';

const PLAN: RoutePlanDto = {
  id: 'ffffffff-0001-4000-8000-000000000001',
  datum: '2026-09-19',
  voziloId: 'eeeeeeee-0001-4000-8000-000000000001',
  voziloOznaka: 'JKP-01',
  status: 'predlog',
  algoritam: 'greedy-risk-aware-v1',
  generisanAt: '2026-09-19T04:00:00.000Z',
  ukupnaDistancaM: 18400,
  ukupnoTrajanjeMin: 52,
  stajalista: [
    {
      redosled: 1,
      sabirnoMestoId: 'bbbbbbbb-0001-4000-8000-000000000001',
      naseljeId: 'aaaaaaaa-0002-4000-8000-000000000002',
      naziv: 'Krupac - centar sela',
      lat: 43.116004,
      lon: 22.675066,
      razlog: 'prelivanje_rizik',
      prioritet: 0.245,
      obavezno: false,
      komponente: { prelivanje: { vrednost: 0.7, doprinos: 0.245 } },
      kontejneri: [
        {
          kontejnerId: 'cccccccc-0001-4000-8000-000000000001',
          oznaka: 'PI-KRU-004',
          tipOtpada: 'komunalni',
          ocekivanoPunjenje: 85,
          imaOcitavanje: true,
          razlog: 'prelivanje_rizik',
          prioritet: 0.245,
          obavezno: false,
          komponente: { prelivanje: { vrednost: 0.7, doprinos: 0.245 } },
        },
      ],
      ocekivanoPunjenje: 85,
      imaOcitavanje: true,
      planiraniDolazak: '2026-09-19T04:31:00.000Z',
      doprinosCeniMin: 41.2,
    },
  ],
  ciljFunkcija: { tezine: DEFAULT_WEIGHTS, parametri: DEFAULT_PARAMETERS },
  putanja: [
    { lat: 43.1531, lon: 22.586 },
    { lat: 43.116004, lon: 22.675066 },
    { lat: 43.1531, lon: 22.586 },
  ],
};

describe('RoutingController', () => {
  const build = async (service: Partial<RoutingService>) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RoutingController],
      providers: [{ provide: RoutingService, useValue: service }],
    }).compile();
    return moduleRef.get(RoutingController);
  };

  it('returns the generated plans, the uncovered stops and the objective it used', async () => {
    const generate = jest.fn(async () => ({
      datum: '2026-09-19',
      planovi: [PLAN],
      nepokriveno: [],
      preskoceno: 2,
      preskocenaLista: [],
      ciljFunkcija: { tezine: DEFAULT_WEIGHTS, parametri: DEFAULT_PARAMETERS },
    }));
    const controller = await build({ generate });

    const result = await controller.generate({ datum: '2026-09-19' });

    expect(generate).toHaveBeenCalledWith({ datum: '2026-09-19' });
    expect(result.datum).toBe('2026-09-19');
    expect(result.planovi).toHaveLength(1);
    expect(result.planovi[0].stajalista[0].razlog).toBe('prelivanje_rizik');
    expect(result.planovi[0].putanja).toHaveLength(3);
    expect(result.nepokriveno).toEqual([]);
    expect(typeof result.preskoceno).toBe('number');
    expect(result.ciljFunkcija.tezine.prelivanje).toBe(DEFAULT_WEIGHTS.prelivanje);
  });

  it('lists plans for the requested day', async () => {
    const list = jest.fn(async () => [PLAN]);
    const controller = await build({ list });

    const result = await controller.list({ datum: '2026-09-19', status: 'predlog' });

    expect(list).toHaveBeenCalledWith({ datum: '2026-09-19', status: 'predlog' });
    expect(result[0].voziloOznaka).toBe('JKP-01');
  });

  it('returns one plan by id', async () => {
    const get = jest.fn(async () => PLAN);
    const controller = await build({ get });

    const result = await controller.get(PLAN.id);

    expect(get).toHaveBeenCalledWith(PLAN.id);
    expect(result.id).toBe(PLAN.id);
  });
});
