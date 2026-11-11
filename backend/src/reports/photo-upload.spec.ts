import { BadRequestException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ReportsService } from './reports.service';
import type { ReportsRepository } from './reports.repository';
import type { StoragePort } from '../storage/storage.port';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);

const file = (buffer: Buffer): Express.Multer.File =>
  ({ buffer, size: buffer.length, originalname: '../../etc/passwd' }) as Express.Multer.File;

function harness(overrides: Partial<Record<keyof ReportsRepository, unknown>> = {}) {
  const put = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const storage: StoragePort = {
    put, remove,
    url: (kljuc) => `https://store.example/storage/v1/object/public/neOtpad%20Bucket/${kljuc}`,
  };
  const insertPhoto = jest.fn().mockImplementation((values: Record<string, unknown>) => Promise.resolve({
    ...values, id: '66666666-6666-4666-8666-666666666666', otpremljena_at: new Date('2026-09-19T12:00:00Z'),
  }));
  const repository = { insertPhoto, ...overrides } as unknown as ReportsRepository;
  const config = { get: (_key: string, fallback: number) => fallback } as unknown as ConfigService;
  return { service: new ReportsService(repository, storage, config), put, remove, insertPhoto };
}

describe('photo upload', () => {
  it('stores the bytes and returns a claimable identifier', async () => {
    const { service, put } = harness();
    const receipt = await service.uploadPhoto(file(JPEG));

    expect(receipt.foto_id).toBe('66666666-6666-4666-8666-666666666666');
    expect(receipt.mime_tip).toBe('image/jpeg');
    expect(receipt.velicina_bajt).toBe(JPEG.length);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('encodes the bucket, so a name with a space is still a usable URL', async () => {
    const { service } = harness();
    const receipt = await service.uploadPhoto(file(JPEG));
    expect(receipt.javni_url).toContain('/neOtpad%20Bucket/prijave/');
    expect(receipt.javni_url).not.toContain(' ');
  });

  it('never lets the client filename reach the object key', async () => {
    const { service, put } = harness();
    await service.uploadPhoto(file(JPEG));
    const kljuc = put.mock.calls[0][0] as string;
    expect(kljuc).toMatch(/^prijave\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
    expect(kljuc).not.toContain('passwd');
  });

  it('gives the upload a deadline, so an abandoned photo does not live forever', async () => {
    const { service, insertPhoto } = harness();
    await service.uploadPhoto(file(JPEG));
    const { istice_at } = insertPhoto.mock.calls[0][0] as { istice_at: Date };
    expect(istice_at.getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses a file whose content is not an image, before it reaches the bucket', async () => {
    const { service, put } = harness();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    await expect(service.uploadPhoto(file(svg))).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    expect(put).not.toHaveBeenCalled();
  });

  it('refuses an empty or absent file', async () => {
    const { service } = harness();
    await expect(service.uploadPhoto(undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.uploadPhoto(file(Buffer.alloc(0)))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a file over the ceiling even if multer let it through', async () => {
    const { service } = harness();
    const huge = { ...file(JPEG), size: 99_999_999 } as Express.Multer.File;
    await expect(service.uploadPhoto(huge)).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('removes the object when the row cannot be written, leaving no orphan', async () => {
    const { service, remove } = harness({ insertPhoto: jest.fn().mockRejectedValue(new Error('db down')) });
    await expect(service.uploadPhoto(file(JPEG))).rejects.toThrow('db down');
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
