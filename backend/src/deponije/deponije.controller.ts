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
import { DeponijeService } from './deponije.service';
import { DumpPageDto, DumpQueryDto } from './dto/deponije.dto';

/**
 * The historical illegal-dump register: the canonical sites behind the risk
 * map's `žarišta` layer. Dispatcher-facing, like the rest of the risk data — a
 * public list of unattended dump sites with coordinates is a map of where to tip
 * next.
 */
@ApiTags('dumps')
@ApiBadRequestResponse({ description: 'Invalid query.' })
@ApiUnauthorizedResponse({ description: 'Staff login required.' })
@ApiForbiddenResponse({ description: 'Dispatcher or admin role required.' })
@ApiBearerAuth()
@UseGuards(StaffGuard)
@DispatcherOnly()
@Controller('dumps')
export class DeponijeController {
  constructor(private readonly deponije: DeponijeService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listDumps',
    summary: 'List illegal dumps that still stand',
    description:
      'The merged dump register for Pirot, ordered by register id, each row carrying the years it was recorded, the sources it came ' +
      'from and how well its coordinate is known. Cleared and remediated sites are left out unless `sve` asks for them — but a cleared ' +
      'site the sources record as refilling stays in, because clearing without a container is not a fix. `sa_lokacijom` drops the ones ' +
      'a map cannot draw.',
  })
  @ApiOkResponse({ description: 'One page of dumps.', type: DumpPageDto })
  listDumps(@Query() query: DumpQueryDto): Promise<DumpPageDto> {
    return this.deponije.kanonske(query);
  }
}
