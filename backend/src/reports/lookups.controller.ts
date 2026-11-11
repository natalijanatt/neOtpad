import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { DispatcherOnly, StaffGuard } from '../auth/auth.guard';
import { LookupPageDto, LookupQueryDto, type LookupItemDto } from './dto/reports.dto';
import { LookupsRepository } from './lookups.repository';

function page(items: LookupItemDto[], query: LookupQueryDto): LookupPageDto {
  return { items: items.slice(0, query.limit), page: query.page, limit: query.limit, hasMore: items.length > query.limit };
}

@ApiTags('lookups')
@ApiBadRequestResponse({ description: 'Invalid lookup query.' })
@Controller()
export class LookupsController {
  constructor(private readonly repository: LookupsRepository) {}

  @Get('settlements')
  @ApiOperation({ operationId: 'listSettlements', summary: 'Find settlements for a report', description: 'Returns a bounded page of settlement names and identifiers, optionally searched by name.' })
  @ApiOkResponse({ description: 'Settlement names and identifiers.', type: LookupPageDto })
  async settlements(@Query() query: LookupQueryDto): Promise<LookupPageDto> { return page(await this.repository.settlements(query), query); }

  @Get('intermediaries')
  @Header('Cache-Control', 'no-store')
  @UseGuards(StaffGuard) @DispatcherOnly() @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Staff login required.' })
  @ApiForbiddenResponse({ description: 'Dispatcher or admin role required.' })
  @ApiOperation({ operationId: 'listIntermediaries', summary: 'Find active reporting intermediaries', description: 'Lists active intermediaries without exposing phone numbers.' })
  @ApiOkResponse({ description: 'Intermediary names and identifiers without contact data.', type: LookupPageDto })
  async intermediaries(@Query() query: LookupQueryDto): Promise<LookupPageDto> { return page(await this.repository.intermediaries(query), query); }
}
