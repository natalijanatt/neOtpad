import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { StoragePort } from './storage.port';

const logger = new Logger('Storage');

@Injectable()
export class S3StorageService implements StoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBase: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.getOrThrow<string>('STORAGE_BUCKET');
    this.publicBase = this.config.getOrThrow<string>('STORAGE_PUBLIC_BASE_URL').replace(/\/+$/, '');
    this.client = new S3Client({
      endpoint: this.config.getOrThrow<string>('STORAGE_S3_ENDPOINT'),
      region: this.config.getOrThrow<string>('STORAGE_S3_REGION'),
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('STORAGE_S3_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('STORAGE_S3_SECRET_ACCESS_KEY'),
      },
      // Supabase Storage serves one endpoint for every bucket, so the bucket
      // has to travel in the path. Virtual-host addressing would resolve to a
      // hostname that does not exist -- and could not carry a bucket name with
      // a space in it at all.
      forcePathStyle: true,
    });
  }

  async put(kljuc: string, telo: Buffer, mimeTip: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: kljuc,
      Body: telo,
      ContentType: mimeTip,
      // The bucket is public, so this is what a browser will cache. Objects are
      // immutable -- a replaced photo gets a new uuid -- so a year is safe.
      CacheControl: 'public, max-age=31536000, immutable',
    }));
  }

  async remove(kljuc: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: kljuc }));
    } catch (error) {
      // The database row is the record that matters and it is already gone.
      // A surviving object is a leak for the cleanup sweep, not a failed request.
      logger.warn(`could not remove ${kljuc}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  url(kljuc: string): string {
    // The bucket name is encoded, the key is not: a key is server-generated from
    // [a-z0-9/.-] and its slashes are path separators that must survive. The
    // bucket is operator-supplied and this project's is literally `neOtpad
    // Bucket` -- a raw space here would be an unusable URL in the database.
    return `${this.publicBase}/${encodeURIComponent(this.bucket)}/${kljuc}`;
  }
}
