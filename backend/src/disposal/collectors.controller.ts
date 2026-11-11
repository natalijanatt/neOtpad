import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminOnly, StaffGuard } from '../auth/auth.guard';
import { CollectorDto, CreateCollectorDto } from './dto/disposal.dto';
import { DisposalService } from './disposal.service';

/**
 * Collectors of materials JKP does not take. Every route is admin-only: a
 * collector's phone number is shown to the public, so a person at the utility
 * confirms the collector is real before it is. Citizens reach collectors only
 * through `POST /disposal/suggest`, which returns the few who match — there is
 * deliberately no public "all phone numbers" list to scrape.
 */
@ApiTags('collectors')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Staff login required.' })
@ApiForbiddenResponse({ description: 'Administrator role required.' })
@UseGuards(StaffGuard)
@AdminOnly()
@Controller('collectors')
export class CollectorsController {
  constructor(private readonly disposal: DisposalService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'listCollectors', summary: 'List all collectors', description: 'Every registered collector with the materials they accept, sorted by last name.' })
  @ApiOkResponse({ description: 'All collectors.', type: [CollectorDto] })
  list(): Promise<CollectorDto[]> {
    return this.disposal.list();
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'createCollector', summary: 'Register a collector', description: 'Adds a collector with first name, last name, phone and accepted materials. The phone is normalised to E.164 and must be unique.' })
  @ApiCreatedResponse({ description: 'The registered collector.', type: CollectorDto })
  @ApiBadRequestResponse({ description: 'Invalid input or a phone that is not a Serbian number.' })
  @ApiConflictResponse({ description: 'A collector with this phone number already exists.' })
  create(@Body() input: CreateCollectorDto): Promise<CollectorDto> {
    return this.disposal.create(input);
  }

  @Delete(':id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'deleteCollector', summary: 'Remove a collector', description: 'Removes the collector; their number stops appearing in search results immediately.' })
  @ApiNoContentResponse({ description: 'Collector removed.' })
  @ApiNotFoundResponse({ description: 'Unknown collector.' })
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.disposal.remove(id);
  }
}
