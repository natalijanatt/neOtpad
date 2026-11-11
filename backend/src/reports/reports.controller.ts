import { Body, Controller, Get, Header, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseGuards, UseInterceptors, ValidationPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiConsumes, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CurrentStaff, DispatcherOnly, StaffGuard } from '../auth/auth.guard';
import type { StaffDto } from '../auth/auth.dto';
import { RateLimit, RateLimitGuard } from '../auth/rate-limit';
import { AssistedReportDto, CreateReportDto, IdempotencyDto, PhotoReceiptDto, RemovePhotoDto, ReportDetailDto, ReportPageDto, ReportQueryDto, ReportReceiptDto, ReportResponseDto, ResolveReportDto, TriageReportDto } from './dto/reports.dto';
import { ReportsService } from './reports.service';

const keyPipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, expectedType: IdempotencyDto, validateCustomDecorators: true });

/**
 * Read straight from the environment because an interceptor's options are
 * evaluated when the decorator runs, long before ConfigService exists. The
 * service re-checks the same ceiling against ConfigService, so a mismatch
 * between the two shows up as a rejected upload rather than an accepted one.
 */
const MAX_FOTO_BAJT = Number(process.env.STORAGE_MAX_BYTES ?? 8388608);

@ApiTags('reports')
@ApiBadRequestResponse({ description: 'Invalid input, location or business rule.' })
@ApiConflictResponse({ description: 'Stale version, invalid transition or idempotency conflict.' })
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  private async key(value: string | undefined): Promise<string> {
    const input = await keyPipe.transform({ key: value }, { type: 'body', metatype: IdempotencyDto });
    return (input as IdempotencyDto).key.toLowerCase();
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @UseGuards(RateLimitGuard)
  @RateLimit('report-submit', 10, 600)
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID identifying this submission. Reuse for retries.', schema: { type: 'string', format: 'uuid' } })
  @ApiOperation({ operationId: 'createReport', summary: 'Submit an anonymous web report', description: 'Accepts a problem and coordinates, settlement or container. Returns a receipt; retries with the same key and body return the original receipt.' })
  @ApiCreatedResponse({ description: 'Submission receipt, also returned for retries.', type: ReportReceiptDto })
  @ApiResponse({ status: 429, description: 'Submission rate limit exceeded.' })
  @ApiResponse({ status: 503, description: 'Receipt allocation failed; retry with the same key.' })
  async create(@Body() input: CreateReportDto, @Headers('idempotency-key') key: string | undefined): Promise<ReportReceiptDto> {
    return this.reports.create(input, await this.key(key));
  }

  @Post('assisted')
  @Header('Cache-Control', 'no-store')
  @UseGuards(StaffGuard)
  @DispatcherOnly()
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Staff login required.' })
  @ApiForbiddenResponse({ description: 'Dispatcher or admin role required.' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID identifying this submission. Reuse for retries.', schema: { type: 'string', format: 'uuid' } })
  @ApiOperation({ operationId: 'createAssistedReport', summary: 'Record a telephone or intermediary report', description: 'Records a non-smartphone report, attributing creation to the authenticated dispatcher. Intermediary submissions require an active intermediary.' })
  @ApiCreatedResponse({ description: 'Submission receipt.', type: ReportReceiptDto })
  @ApiResponse({ status: 503, description: 'Receipt allocation failed; retry with the same key.' })
  async assisted(@Body() input: AssistedReportDto, @Headers('idempotency-key') key: string | undefined, @CurrentStaff() staff: StaffDto): Promise<ReportReceiptDto> {
    return this.reports.create(input, await this.key(key), staff.id);
  }

  @Post('photos')
  @Header('Cache-Control', 'no-store')
  @UseGuards(RateLimitGuard)
  @RateLimit('report-photo', 20, 600)
  @UseInterceptors(FileInterceptor('foto', {
    // Buffered, not spooled to disk: the file is sniffed, hashed and forwarded
    // to the bucket within the request, and a temp file would only add a path
    // to clean up on every error branch.
    storage: memoryStorage(),
    limits: { fileSize: MAX_FOTO_BAJT, files: 1 },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['foto'],
      properties: { foto: { type: 'string', format: 'binary', description: 'JPEG, PNG, WebP or HEIC image.' } },
    },
  })
  @ApiOperation({
    operationId: 'uploadReportPhoto',
    summary: 'Upload a photo before submitting a report',
    description: 'Stores an image and returns a single-use identifier to pass as foto_ids on the submission that follows. Unclaimed uploads expire. The image type is determined from the file content, not from the request header.',
  })
  @ApiCreatedResponse({ description: 'Stored photo and its public address.', type: PhotoReceiptDto })
  @ApiResponse({ status: 413, description: 'Photo exceeds the configured size limit.' })
  @ApiResponse({ status: 415, description: 'File content is not an accepted image type.' })
  @ApiResponse({ status: 429, description: 'Upload rate limit exceeded.' })
  uploadPhoto(@UploadedFile() foto: Express.Multer.File | undefined): Promise<PhotoReceiptDto> {
    return this.reports.uploadPhoto(foto);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  @UseGuards(StaffGuard) @DispatcherOnly() @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Staff login required.' })
  @ApiForbiddenResponse({ description: 'Dispatcher or admin role required.' })
  @ApiOperation({ operationId: 'listReports', summary: 'Read the staff report queue', description: 'Filters reports by status, settlement, type, channel or exact receipt code, newest first.' })
  @ApiOkResponse({ description: 'Filtered report page.', type: ReportPageDto })
  list(@Query() query: ReportQueryDto): Promise<ReportPageDto> { return this.reports.list(query); }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @UseGuards(StaffGuard) @DispatcherOnly() @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Staff login required.' })
  @ApiForbiddenResponse({ description: 'Dispatcher or admin role required.' })
  @ApiNotFoundResponse({ description: 'Unknown report.' })
  @ApiOperation({ operationId: 'getReport', summary: 'Read a report and its audit history', description: 'Returns report content and immutable versioned history for utility staff.' })
  @ApiOkResponse({ description: 'Staff report detail.', type: ReportDetailDto })
  detail(@Param('id', new ParseUUIDPipe()) id: string): Promise<ReportDetailDto> { return this.reports.detail(id); }

  @Post(':id/triage')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(StaffGuard) @DispatcherOnly() @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Staff login required.' })
  @ApiForbiddenResponse({ description: 'Dispatcher or admin role required.' })
  @ApiNotFoundResponse({ description: 'Unknown report.' })
  @ApiOperation({ operationId: 'triageReport', summary: 'Confirm, refine, reject or mark a report duplicate', description: 'Requires the current version and an explanation. Confirmation selects a response category; closed reports cannot be changed.' })
  @ApiOkResponse({ description: 'Updated report and new version.', type: ReportResponseDto })
  triage(@Param('id', new ParseUUIDPipe()) id: string, @Body() input: TriageReportDto, @CurrentStaff() staff: StaffDto): Promise<ReportResponseDto> {
    return this.reports.triage(id, input, staff.id);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(StaffGuard) @DispatcherOnly() @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Staff login required.' })
  @ApiForbiddenResponse({ description: 'Dispatcher or admin role required.' })
  @ApiNotFoundResponse({ description: 'Unknown report.' })
  @ApiOperation({ operationId: 'resolveReport', summary: 'Record completed work on a confirmed report', description: 'Requires current version and completion note. Reports awaiting location verification cannot be resolved.' })
  @ApiOkResponse({ description: 'Resolved report and new version.', type: ReportResponseDto })
  resolve(@Param('id', new ParseUUIDPipe()) id: string, @Body() input: ResolveReportDto, @CurrentStaff() staff: StaffDto): Promise<ReportResponseDto> {
    return this.reports.resolve(id, input, staff.id);
  }

  @Post(':id/photos/:fotoId/remove')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @UseGuards(StaffGuard) @DispatcherOnly() @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Staff login required.' })
  @ApiForbiddenResponse({ description: 'Dispatcher or admin role required.' })
  @ApiNotFoundResponse({ description: 'Unknown report, or the photo does not belong to it.' })
  @ApiOperation({
    operationId: 'removeReportPhoto',
    summary: 'Remove a photo from a report',
    description: 'Deletes a photo that should not stay public - a face, a number plate, a house number. POST rather than DELETE because the reason is required and is recorded in the report history. The report version is unchanged.',
  })
  @ApiNoContentResponse({ description: 'Photo removed.' })
  async removePhoto(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('fotoId', new ParseUUIDPipe()) fotoId: string,
    @Body() input: RemovePhotoDto,
    @CurrentStaff() staff: StaffDto,
  ): Promise<void> {
    await this.reports.removePhoto(id, fotoId, input, staff.id);
  }
}
