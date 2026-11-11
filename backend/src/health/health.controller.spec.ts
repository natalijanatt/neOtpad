import { Test } from '@nestjs/testing';
import { DatabaseHealth } from '../database/database.health';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const build = async (probe: Partial<DatabaseHealth>) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DatabaseHealth, useValue: probe }],
    }).compile();
    return moduleRef.get(HealthController);
  };

  it('returns the shape the contract promises', async () => {
    const controller = await build({
      check: async () => ({ reachable: true, latencyMs: 3 }),
    });

    const result = await controller.getHealth();

    expect(result.status).toBe('ok');
    expect(typeof result.version).toBe('string');
    expect(typeof result.uptimeSeconds).toBe('number');
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(result.database).toEqual({ reachable: true, latencyMs: 3 });
  });

  it('reports degraded instead of failing when the database is unreachable', async () => {
    const controller = await build({ check: async () => ({ reachable: false }) });

    const result = await controller.getHealth();

    expect(result.status).toBe('degraded');
    expect(result.database?.reachable).toBe(false);
  });
});
