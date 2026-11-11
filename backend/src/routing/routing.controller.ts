import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GeneratePlanRequestDto } from './dto/generate-plan-request.dto';
import { ListRoutePlansQueryDto } from './dto/list-route-plans-query.dto';
import { GeneratePlanResponseDto, PrioritetKomponentaDto, RoutePlanDto } from './dto/route-plan.dto';
import { RoutingService } from './routing.service';

@ApiTags('routes')
@ApiExtraModels(PrioritetKomponentaDto)
@Controller('routes')
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  @Post('plan')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'generateRoutePlan',
    summary: 'Generate the daily route plan',
    description:
      'Scores every active collection point (forecast overflow, dump risk, confirmed reports, coverage), ' +
      'then builds one route per active vehicle. Plans are stored as proposals for a dispatcher to approve. ' +
      'Must-visit stops that no vehicle could take are returned as `nepokriveno`, never dropped.',
  })
  @ApiCreatedResponse({ description: 'The generated plans, one per vehicle with stops.', type: GeneratePlanResponseDto })
  generate(@Body() body: GeneratePlanRequestDto): Promise<GeneratePlanResponseDto> {
    return this.routing.generate(body);
  }

  @Get()
  @ApiOperation({
    operationId: 'listRoutePlans',
    summary: 'List route plans for a day',
    description: 'Every generated plan for the day, newest generation first. Defaults to today.',
  })
  @ApiOkResponse({ description: 'Plans for the day, possibly empty.', type: RoutePlanDto, isArray: true })
  list(@Query() query: ListRoutePlansQueryDto): Promise<RoutePlanDto[]> {
    return this.routing.list(query);
  }

  @Get(':id')
  @ApiOperation({
    operationId: 'getRoutePlan',
    summary: 'One route plan with its stops',
    description: 'The plan as stored, including the priority components of every stop.',
  })
  @ApiOkResponse({ description: 'The plan.', type: RoutePlanDto })
  @ApiNotFoundResponse({ description: 'No plan with that id.' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<RoutePlanDto> {
    return this.routing.get(id);
  }
}
