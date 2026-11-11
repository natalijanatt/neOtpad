import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NewsController } from './news.controller';
import { NewsRepository } from './news.repository';
import { NewsService } from './news.service';

@Module({
  imports: [AuthModule],
  controllers: [NewsController],
  providers: [NewsRepository, NewsService],
})
export class NewsModule {}
