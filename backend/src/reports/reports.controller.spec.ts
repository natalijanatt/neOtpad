import { BadRequestException } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

describe('report submission boundary', () => {
  const create = jest.fn();
  const controller = new ReportsController({ create } as unknown as ReportsService);

  beforeEach(() => create.mockReset());

  it('rejects a missing retry identifier before writing anything', async () => {
    await expect(controller.create({ tip: 'prelivanje' }, undefined)).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('normalizes UUID header casing so retries use the same identity', async () => {
    const receipt = { kratki_kod: 'PR-ABCDEF123456', status: 'nova', primljena_at: '2026-09-18T12:00:00.000Z' };
    create.mockResolvedValue(receipt);
    const input = { tip: 'prelivanje' as const, naselje_id: 'aaaaaaaa-0002-4000-8000-000000000002' };
    await expect(controller.create(input, 'ABCDABCD-1111-4111-8111-ABCDABCDABCD')).resolves.toEqual(receipt);
    expect(create).toHaveBeenCalledWith(input, 'abcdabcd-1111-4111-8111-abcdabcdabcd');
  });
});
