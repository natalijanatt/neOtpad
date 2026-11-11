import { Body, Controller, Get, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RateLimit, RateLimitGuard } from '../auth/rate-limit';
import { DisposalQueryDto, DisposalSiteDto, DisposalSuggestionDto } from './dto/disposal.dto';
import { DisposalService } from './disposal.service';

@ApiTags('disposal')
@Controller('disposal')
export class DisposalController {
  constructor(private readonly disposal: DisposalService) {}

  /** Public and cheap — a database read, no model — so no rate limit. */
  @Get('sites')
  @ApiOperation({ operationId: 'listDisposalSites', summary: 'List drop-off sites for the citizen map', description: 'Real, sourced sites with what each takes. The disposal search matches on materijali.' })
  @ApiOkResponse({ description: 'Drop-off sites, sorted by name.', type: [DisposalSiteDto] })
  sites(): Promise<DisposalSiteDto[]> {
    return this.disposal.listSites();
  }

  /**
   * Public, because citizens have no accounts — and therefore rate-limited:
   * every call can reach a paid model, and an open endpoint without a limit is
   * an invitation to run up the bill (`security-rate-limiting`).
   *
   * POST rather than GET: it has a body and a cost, and a GET would be
   * prefetched, cached and crawled.
   */
  @Post('suggest')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(RateLimitGuard)
  @RateLimit('disposal-suggest', 30, 600)
  @ApiOperation({
    operationId: 'suggestDisposal',
    summary: 'Recognise what a citizen wants to dispose of',
    description: 'Classifies free Serbian text (any script, dialect or spelling) into a material and lists collectors who take it, plus the regional landfill operator as a fallback contact.',
  })
  @ApiOkResponse({ description: 'Recognised material, matching collectors and the default contact.', type: DisposalSuggestionDto })
  @ApiBadRequestResponse({ description: 'Query missing, too short or over 200 characters.' })
  @ApiResponse({ status: 429, description: 'Too many searches from this address; try again later.' })
  suggest(@Body() input: DisposalQueryDto): Promise<DisposalSuggestionDto> {
    return this.disposal.suggest(input.upit);
  }
}
