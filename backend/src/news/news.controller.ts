import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AdminOnly, CurrentStaff, StaffGuard } from '../auth/auth.guard';
import type { StaffDto } from '../auth/auth.dto';
import { CreateNewsDto, NewsPageDto, NewsQueryDto, NewsResponseDto, UpdateNewsDto } from './dto/news.dto';
import { NewsService } from './news.service';

/**
 * Utility news for citizens.
 *
 * Reading is public: the feed is the citizen side of the app and nobody signs
 * in there. Publishing is admin-only — a post reaches every citizen and an SMS
 * that has gone out cannot be recalled, so it is not a dispatcher's routine
 * action (`security-use-guards`).
 */
@ApiTags('news')
@ApiBadRequestResponse({ description: 'Invalid input, unknown settlement or SMS text longer than one message.' })
@Controller('news')
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Get()
  @ApiOperation({ operationId: 'listNews', summary: 'Read the citizen news feed', description: 'Returns posts in feed order: pinned first, then newest. A settlement filter also returns municipality-wide posts.' })
  @ApiOkResponse({ description: 'News page in feed order.', type: NewsPageDto })
  list(@Query() query: NewsQueryDto): Promise<NewsPageDto> { return this.news.list(query); }

  @Post()
  @Header('Cache-Control', 'no-store')
  @UseGuards(StaffGuard) @AdminOnly() @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Staff login required.' })
  @ApiForbiddenResponse({ description: 'Administrator role required.' })
  @ApiOperation({ operationId: 'createNews', summary: 'Publish a news post', description: 'Publishes immediately to the citizen feed. The optional SMS text is the copy for citizens without a smartphone and must fit one message.' })
  @ApiCreatedResponse({ description: 'The published post.', type: NewsResponseDto })
  create(@Body() input: CreateNewsDto, @CurrentStaff() staff: StaffDto): Promise<NewsResponseDto> {
    return this.news.create(input, staff.id);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @UseGuards(StaffGuard) @AdminOnly() @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Staff login required.' })
  @ApiForbiddenResponse({ description: 'Administrator role required.' })
  @ApiNotFoundResponse({ description: 'Unknown post.' })
  @ApiConflictResponse({ description: 'Stale version: the post was edited by someone else.' })
  @ApiOperation({ operationId: 'updateNews', summary: 'Edit a post, or pin and unpin it', description: 'Requires the current version. Omitted fields keep their value, an explicit null clears one, and pinning is the zakacena field. Publication time does not change.' })
  @ApiOkResponse({ description: 'The edited post and its new version.', type: NewsResponseDto })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() input: UpdateNewsDto): Promise<NewsResponseDto> {
    return this.news.update(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @UseGuards(StaffGuard) @AdminOnly() @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Staff login required.' })
  @ApiForbiddenResponse({ description: 'Administrator role required.' })
  @ApiNotFoundResponse({ description: 'Unknown post.' })
  // Unversioned on purpose: unlike an edit there is nothing to merge, and an
  // SMS already sent is not recalled by deleting the post.
  @ApiOperation({ operationId: 'deleteNews', summary: 'Delete a post', description: 'Removes the post from the feed. Messages already sent by SMS or Viber are not recalled.' })
  @ApiNoContentResponse({ description: 'Post deleted.' })
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> { return this.news.remove(id); }
}
