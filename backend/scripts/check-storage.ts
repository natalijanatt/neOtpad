/**
 * End-to-end check of the photo bucket: upload, fetch back over the public URL,
 * delete.
 *
 * It exists because this project's bucket is named `neOtpad Bucket` — with a
 * space, which is not a legal S3 bucket name. Path-style addressing and an
 * encoded bucket segment should carry it, but "should" is not verification, and
 * the failure mode otherwise appears for the first time when a citizen submits
 * a photograph. Run this once after filling in the storage keys, and again after
 * ever changing STORAGE_BUCKET.
 *
 *   npm run storage:check
 */
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { STORAGE, type StoragePort } from '../src/storage/storage.port';
import { photoKey, sniffPhoto } from '../src/reports/photo-content';

/** A real 1x1 PNG, so the sniffer sees what it would see from a phone. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const storage = app.get<StoragePort>(STORAGE);
    const config = app.get(ConfigService);
    const bucket = config.getOrThrow<string>('STORAGE_BUCKET');
    console.log(`bucket   : ${JSON.stringify(bucket)}`);

    const content = sniffPhoto(PNG);
    if (!content) throw new Error('The built-in test image failed its own sniff check');

    const kljuc = `${photoKey(content)}`;
    const url = storage.url(kljuc);
    console.log(`key      : ${kljuc}`);
    console.log(`url      : ${url}`);
    if (/\s/.test(url)) throw new Error('The public URL contains a raw space; the bucket segment was not encoded');

    await storage.put(kljuc, PNG, content.mimeTip);
    console.log('put      : ok');

    // The bucket is public, so an anonymous fetch is exactly what a browser does.
    const response = await fetch(url);
    if (!response.ok) throw new Error(`public fetch returned ${response.status} ${response.statusText}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.equals(PNG)) throw new Error(`public fetch returned ${bytes.length} bytes, expected ${PNG.length}`);
    console.log(`fetch    : ok (${bytes.length} bytes, ${response.headers.get('content-type') ?? 'no content-type'})`);

    await storage.remove(kljuc);
    console.log('remove   : ok');
    console.log('\nStorage is configured correctly.');
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error('\nStorage check FAILED:');
  console.error(error instanceof Error ? error.message : error);
  console.error('\nCheck STORAGE_S3_ENDPOINT, STORAGE_S3_REGION, the S3 access keys, and that');
  console.error('STORAGE_BUCKET matches the bucket id exactly, spaces and capitals included.');
  process.exitCode = 1;
});
