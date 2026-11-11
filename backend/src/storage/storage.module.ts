import { Global, Module } from '@nestjs/common';
import { S3StorageService } from './s3-storage.service';
import { STORAGE } from './storage.port';

@Global()
@Module({
  providers: [{ provide: STORAGE, useClass: S3StorageService }],
  exports: [STORAGE],
})
export class StorageModule {}
