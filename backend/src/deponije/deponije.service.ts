import { Injectable } from '@nestjs/common';
import { DeponijeRepository } from './deponije.repository';
import { toDump } from './deponije.response';
import type { DumpPageDto, DumpQueryDto } from './dto/deponije.dto';

@Injectable()
export class DeponijeService {
  constructor(private readonly repository: DeponijeRepository) {}

  async kanonske(query: DumpQueryDto): Promise<DumpPageDto> {
    const rows = await this.repository.kanonske(query);

    return {
      // The repository asks for one row more than the page size; that row is
      // never returned, it only answers whether another page exists.
      items: rows.slice(0, query.limit).map(toDump),
      page: query.page,
      limit: query.limit,
      hasMore: rows.length > query.limit,
    };
  }
}
