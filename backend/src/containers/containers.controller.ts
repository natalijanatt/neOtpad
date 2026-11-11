import { Controller, Get, Header, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DispatcherOnly, StaffGuard } from '../auth/auth.guard';
import { ContainersService } from './containers.service';
import {
  ContainerListItemDto,
  ContainerPageDto,
  ContainerQueryDto,
  ContainerReadingDto,
  ContainerReadingsQueryDto,
} from './dto/containers.dto';

/**
 * The container fleet. `GET /containers` moved here from the reports lookups
 * controller when it grew past "id and label": two controllers cannot hold the
 * same path, and a container's state belongs to containers rather than to
 * reporting. The default response is unchanged, so the report wizard that reads
 * it as a reference list keeps working — everything richer is behind
 * `sa_stanjem`.
 *
 * The guard is the one the lookup already had. Widening it to every staff role
 * is a question for whoever decides what a driver may see, not a side effect of
 * moving a handler.
 */
@ApiTags('containers')
@ApiBadRequestResponse({ description: 'Invalid query.' })
@ApiUnauthorizedResponse({ description: 'Staff login required.' })
@ApiForbiddenResponse({ description: 'Dispatcher or admin role required.' })
@ApiBearerAuth()
@UseGuards(StaffGuard)
@DispatcherOnly()
@Controller('containers')
export class ContainersController {
  constructor(private readonly containers: ContainersService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listContainers',
    summary: 'List active containers',
    description:
      'Active containers at active collection points, ordered by label. Returns identifiers and labels by default; ' +
      'with `sa_stanjem` also the location, the cached fill state and a forecast summary without the curve.',
  })
  @ApiOkResponse({ description: 'One page of containers.', type: ContainerPageDto })
  list(@Query() query: ContainerQueryDto): Promise<ContainerPageDto> {
    return this.containers.list(query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'getContainer',
    summary: 'One container with its state and forecast summary',
    description: 'Always includes the state and the forecast summary; the forecast curve itself is a separate call.',
  })
  @ApiOkResponse({ description: 'The container.', type: ContainerListItemDto })
  @ApiNotFoundResponse({ description: 'No container with that id.' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ContainerListItemDto> {
    return this.containers.get(id);
  }

  @Get(':id/readings')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listContainerReadings',
    summary: 'Measured fill history of one container',
    description:
      'Readings oldest first, for the requested number of days back. Unreliable readings are included and flagged, ' +
      'not filtered: hiding them would turn a device fault into an invisible gap.',
  })
  @ApiOkResponse({ description: 'Readings, possibly empty for a container with no sensor.', type: ContainerReadingDto, isArray: true })
  @ApiNotFoundResponse({ description: 'No container with that id.' })
  readings(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ContainerReadingsQueryDto,
  ): Promise<ContainerReadingDto[]> {
    return this.containers.readings(id, query);
  }
}
