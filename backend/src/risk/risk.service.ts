import { Injectable } from '@nestjs/common';
import { RiskRepository } from './risk.repository';
import { toBlackSpot } from './risk.response';
import type { BlackSpotPageDto, BlackSpotQueryDto } from './dto/risk.dto';

@Injectable()
export class RiskService {
  constructor(private readonly repository: RiskRepository) {}

  async crneTacke(query: BlackSpotQueryDto): Promise<BlackSpotPageDto> {
    const rows = await this.repository.crneTacke(query);

    return {
      // The repository asks for one row more than the page size; that row is
      // never returned, it only answers whether another page exists.
      items: rows.slice(0, query.limit).map(toBlackSpot),
      page: query.page,
      limit: query.limit,
      hasMore: rows.length > query.limit,
    };
  }
}
