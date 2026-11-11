import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DispatcherOnly, StaffGuard } from '../auth/auth.guard';
import { RiskService } from './risk.service';
import { BlackSpotPageDto, BlackSpotQueryDto } from './dto/risk.dto';

/**
 * The risk side of the map: recurring locations and what the system proposes
 * doing about them. Dispatcher-facing rather than public — a list of unattended
 * dump sites with coordinates is a map of where to tip next, and the
 * citizen-facing answer to the same data is a clean-up action, not a table.
 */
@ApiTags('risk')
@ApiBadRequestResponse({ description: 'Invalid query.' })
@ApiUnauthorizedResponse({ description: 'Staff login required.' })
@ApiForbiddenResponse({ description: 'Dispatcher or admin role required.' })
@ApiBearerAuth()
@UseGuards(StaffGuard)
@DispatcherOnly()
@Controller('risk')
export class RiskController {
  constructor(private readonly risk: RiskService) {}

  @Get('black-spots')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listBlackSpots',
    summary: 'List open black spots',
    description:
      'Recurring illegal-dump locations that are still open — neither carried out nor dismissed — each with its recommendation and the ' +
      'newest risk score behind it, most urgent first. `sve` includes the closed ones.',
  })
  @ApiOkResponse({ description: 'One page of black spots.', type: BlackSpotPageDto })
  listBlackSpots(@Query() query: BlackSpotQueryDto): Promise<BlackSpotPageDto> {
    return this.risk.crneTacke(query);
  }
}
