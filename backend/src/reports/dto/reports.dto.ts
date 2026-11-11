import { ApiProperty, ApiPropertyOptional, getSchemaPath, PartialType, PickType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsDefined, IsIn, IsInt, IsLatitude, IsLongitude, IsNumber, IsObject, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import type { AppKanalPrijave, AppPreciznostLokacije, AppTipPrijave, AppVelicinaProblema } from '../../database/generated/schema';
import { ClassificationDto } from '../../classification/dto/classification.dto';

import { REPORT_STATUSES, REPORT_TYPES, RESPONSE_TYPES } from '../vocabulary';

// Re-exported so the many existing importers of this module keep working; the
// values themselves live in `vocabulary.ts` to keep this file out of an import
// cycle with the classification DTOs.
export { REPORT_STATUSES, REPORT_TYPES, RESPONSE_TYPES } from '../vocabulary';
export type { ReportStatus, ResponseType } from '../vocabulary';
import type { ReportStatus, ResponseType } from '../vocabulary';
const Trim = () => Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value);
const Optional = () => ValidateIf((_object: unknown, value: unknown) => value !== undefined);

export class PointDto {
  @ApiProperty({ description: 'WGS84 latitude.', example: 43.116004, minimum: -90, maximum: 90 })
  @IsLatitude()
  @IsNumber()
  lat!: number;

  @ApiProperty({ description: 'WGS84 longitude.', example: 22.675066, minimum: -180, maximum: 180 })
  @IsLongitude()
  @IsNumber()
  lon!: number;
}

export class PhotoReceiptDto {
  @ApiProperty({ description: 'Single-use identifier to pass as foto_ids on the submission that follows.', example: '66666666-6666-4666-8666-666666666666', format: 'uuid' })
  foto_id!: string;
  @ApiProperty({ description: 'Public address of the stored image.', example: 'https://example.supabase.co/storage/v1/object/public/bucket/prijave/2026/09/66666666-6666-4666-8666-666666666666.jpg' })
  javni_url!: string;
  @ApiProperty({ description: 'Type determined from the file content, not from the request header.', enum: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'], example: 'image/jpeg' })
  mime_tip!: string;
  @ApiProperty({ description: 'Stored size in bytes.', example: 2418321 })
  velicina_bajt!: number;
  @ApiProperty({ description: 'Deadline for attaching this photo to a report; afterwards it is deleted.', example: '2026-09-20T12:00:00.000Z', format: 'date-time' })
  istice_at!: string;
}

export class PhotoDto {
  @ApiProperty({ description: 'Photo identifier.', example: '66666666-6666-4666-8666-666666666666', format: 'uuid' })
  id!: string;
  @ApiProperty({ description: 'Public address of the image.', example: 'https://example.supabase.co/storage/v1/object/public/bucket/prijave/2026/09/66666666-6666-4666-8666-666666666666.jpg' })
  javni_url!: string;
  @ApiProperty({ description: 'Type determined from the file content.', example: 'image/jpeg' })
  mime_tip!: string;
  @ApiProperty({ description: 'Stored size in bytes.', example: 2418321 })
  velicina_bajt!: number;
  @ApiProperty({ description: 'Capture time when the source carried one.', type: String, nullable: true, example: null, format: 'date-time' })
  snimljeno_at!: string | null;
  @ApiProperty({ description: 'Upload instant.', example: '2026-09-19T12:00:00.000Z', format: 'date-time' })
  otpremljena_at!: string;
}

export class RemovePhotoDto {
  @ApiProperty({ description: 'Why the photo is being removed; recorded in the report history.', example: 'Fotografija sadrzi registarsku tablicu.', maxLength: 2000 })
  @Trim() @IsString() @MinLength(3) @MaxLength(2000)
  razlog!: string;
}

export class CreateReportDto {
  @ApiProperty({ description: 'Reported problem.', enum: REPORT_TYPES, example: 'prelivanje' })
  @IsIn(REPORT_TYPES)
  tip!: AppTipPrijave;

  @ApiPropertyOptional({ description: 'Problem description; required for drugo.', example: 'Kontejner kod skole je pun.', maxLength: 2000 })
  @Optional() @Trim() @IsString() @MinLength(3) @MaxLength(2000)
  opis?: string;

  @ApiPropertyOptional({ description: 'Coordinates supplied by the reporter; never a substituted settlement centroid.', type: PointDto, example: { lat: 43.116004, lon: 22.675066 } })
  @Optional() @IsDefined() @IsObject() @ValidateNested() @Type(() => PointDto)
  tacka?: PointDto;

  @ApiPropertyOptional({ description: 'Known settlement identifier.', example: 'aaaaaaaa-0002-4000-8000-000000000002', format: 'uuid' })
  @Optional() @IsUUID()
  naselje_id?: string;

  @ApiPropertyOptional({ description: 'Known container; settlement is derived and checked by the API.', example: 'cccccccc-0001-4000-8000-000000000001', format: 'uuid' })
  @Optional() @IsUUID()
  kontejner_id?: string;

  @ApiPropertyOptional({ description: 'Landmark or directions. Does not imply surveyed coordinates.', example: 'Kod osnovne skole', maxLength: 1000 })
  @Optional() @Trim() @IsString() @MinLength(3) @MaxLength(1000)
  opis_lokacije?: string;

  @ApiPropertyOptional({ description: 'Coordinate precision. Defaults to gps for supplied coordinates, otherwise opisana or naselje.', enum: ['gps', 'opisana', 'naselje'], example: 'naselje' })
  @Optional() @IsIn(['gps', 'opisana', 'naselje'])
  preciznost_lokacije?: AppPreciznostLokacije;

  @ApiPropertyOptional({ description: 'Reported problem size; dispatcher may correct it.', enum: ['mala', 'srednja', 'velika'], example: 'srednja' })
  @Optional() @IsIn(['mala', 'srednja', 'velika'])
  velicina?: AppVelicinaProblema;

  @ApiPropertyOptional({
    description: 'Photos uploaded through POST /reports/photos, attached to this submission. Each identifier is single-use and expires if unused.',
    type: [String], format: 'uuid', maxItems: 5, example: ['66666666-6666-4666-8666-666666666666'],
  })
  @Optional() @IsArray() @ArrayMaxSize(5) @ArrayUnique() @IsUUID(undefined, { each: true })
  foto_ids?: string[];
}

export class AssistedReportDto extends CreateReportDto {
  @ApiProperty({ description: 'Actual assisted reporting channel.', enum: ['telefon', 'posrednik'], example: 'telefon' })
  @IsIn(['telefon', 'posrednik'])
  kanal!: 'telefon' | 'posrednik';

  @ApiPropertyOptional({ description: 'Active intermediary, required only for posrednik channel.', example: '22222222-2222-4222-8222-222222222222', format: 'uuid' })
  @Optional() @IsUUID()
  posrednik_id?: string;
}

export class IdempotencyDto {
  @ApiProperty({ description: 'Client-generated UUID reused when retrying the same submission.', example: '44444444-4444-4444-8444-444444444444', format: 'uuid' })
  @IsUUID()
  key!: string;
}

export class TriageReportDto extends PartialType(PickType(CreateReportDto, ['tip', 'opis', 'tacka', 'naselje_id', 'kontejner_id', 'opis_lokacije', 'preciznost_lokacije', 'velicina'] as const), { skipNullProperties: false }) {
  @ApiProperty({ description: 'Expected current report version.', example: 1, minimum: 1 })
  @IsInt() @Min(1)
  verzija!: number;

  @ApiProperty({ description: 'Dispatcher decision; confirmation may also refine an already confirmed report.', enum: ['potvrdjena', 'odbijena', 'duplikat'], example: 'potvrdjena' })
  @IsIn(['potvrdjena', 'odbijena', 'duplikat'])
  odluka!: 'potvrdjena' | 'odbijena' | 'duplikat';

  @ApiProperty({ description: 'Staff explanation of the decision.', example: 'Lokacija proverena telefonom.', maxLength: 2000 })
  @Trim() @IsString() @MinLength(3) @MaxLength(2000)
  razlog!: string;

  @ApiPropertyOptional({ description: 'Required when confirming. Collection requires an identified container.', enum: RESPONSE_TYPES, example: 'odvoz' })
  @Optional() @IsIn(RESPONSE_TYPES)
  tip_obrade?: ResponseType;

  @ApiPropertyOptional({ description: 'Manual priority, 1 most urgent through 5 least urgent; confirmation defaults to 3.', example: 3, minimum: 1, maximum: 5 })
  @Optional() @IsInt() @Min(1) @Max(5)
  prioritet?: number;

  @ApiPropertyOptional({ description: 'Original report UUID, required only for duplicate decisions.', example: '55555555-5555-4555-8555-555555555555', format: 'uuid' })
  @Optional() @IsUUID()
  duplikat_od?: string;
}

export class ResolveReportDto {
  @ApiProperty({ description: 'Expected current report version.', example: 2, minimum: 1 })
  @IsInt() @Min(1)
  verzija!: number;

  @ApiProperty({ description: 'Completion note describing the actual work.', example: 'Kontejner ispraznjen; okolni otpad uklonjen.', maxLength: 2000 })
  @Trim() @IsString() @MinLength(3) @MaxLength(2000)
  razlog!: string;
}

export class LookupQueryDto {
  @ApiPropertyOptional({ description: 'Result page, starting at 1.', example: 1, default: 1, minimum: 1, maximum: 100000 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100000)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Maximum items per page.', example: 25, default: 25, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 25;

  @ApiPropertyOptional({ description: 'Case-insensitive name or label search.', example: 'Krupac', maxLength: 100 })
  @Optional() @Trim() @IsString() @MinLength(1) @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Filter containers by settlement.', example: 'aaaaaaaa-0002-4000-8000-000000000002', format: 'uuid' })
  @Optional() @IsUUID()
  naselje_id?: string;
}

export class ReportQueryDto extends PickType(LookupQueryDto, ['page', 'limit', 'naselje_id'] as const) {
  @ApiPropertyOptional({ description: 'Workflow status filter.', enum: REPORT_STATUSES, example: 'nova' })
  @Optional() @IsIn(REPORT_STATUSES)
  status?: ReportStatus;

  @ApiPropertyOptional({ description: 'Problem type filter.', enum: REPORT_TYPES, example: 'prelivanje' })
  @Optional() @IsIn(REPORT_TYPES)
  tip?: AppTipPrijave;

  @ApiPropertyOptional({ description: 'Reporting channel filter.', enum: ['web', 'mobilna', 'sms', 'viber', 'telefon', 'posrednik'], example: 'telefon' })
  @Optional() @IsIn(['web', 'mobilna', 'sms', 'viber', 'telefon', 'posrednik'])
  kanal?: AppKanalPrijave;

  @ApiPropertyOptional({ description: 'Exact receipt code.', example: 'PR-A1B2C3D4E5F6' })
  @Optional() @Matches(/^PR-[A-Z0-9]{4,16}$/)
  kratki_kod?: string;
}

export class ReportReceiptDto {
  @ApiProperty({ description: 'Public receipt code for telephone follow-up; not an authentication credential.', example: 'PR-A1B2C3D4E5F6' })
  kratki_kod!: string;

  @ApiProperty({ description: 'Status at submission, including on an idempotent replay.', enum: ['nova'], example: 'nova' })
  status!: 'nova';

  @ApiProperty({ description: 'Server submission time in UTC.', example: '2026-09-18T12:00:00.000Z', format: 'date-time' })
  primljena_at!: string;
}

export class ReportResponseDto {
  @ApiProperty({ description: 'Internal report identifier, staff only.', example: '55555555-5555-4555-8555-555555555555', format: 'uuid' })
  id!: string;
  @ApiProperty({ description: 'Receipt code.', example: 'PR-A1B2C3D4E5F6' })
  kratki_kod!: string;
  @ApiProperty({ description: 'Reporting channel.', enum: ['web', 'mobilna', 'sms', 'viber', 'telefon', 'posrednik'], example: 'web' })
  kanal!: AppKanalPrijave;
  @ApiProperty({ description: 'Problem type.', enum: REPORT_TYPES, example: 'prelivanje' })
  tip!: AppTipPrijave;
  @ApiProperty({ description: 'Problem description, if provided.', type: String, nullable: true, example: 'Kontejner kod skole je pun.' })
  opis!: string | null;
  @ApiProperty({ description: 'Supplied coordinates; absent for settlement-only reports.', oneOf: [{ $ref: getSchemaPath(PointDto) }, { type: 'object', nullable: true, enum: [null] }], example: null })
  tacka!: PointDto | null;
  @ApiProperty({ description: 'Settlement identifier.', type: String, nullable: true, example: 'aaaaaaaa-0002-4000-8000-000000000002' })
  naselje_id!: string | null;
  @ApiProperty({ description: 'Container identifier.', type: String, nullable: true, example: null })
  kontejner_id!: string | null;
  @ApiProperty({
    description:
      'Registry dump this report was filed under, set when it is confirmed as a `divlja_deponija`. An existing site within 200 m, ' +
      'otherwise one opened by this report. Null for every other type, and again if the report is rejected.',
    type: String,
    nullable: true,
    example: null,
    format: 'uuid',
  })
  kanonska_id!: string | null;
  @ApiProperty({ description: 'Intermediary identifier for assisted reports; excludes contact data.', type: String, nullable: true, example: null })
  posrednik_id!: string | null;
  @ApiProperty({ description: 'Location directions.', type: String, nullable: true, example: 'Kod skole' })
  opis_lokacije!: string | null;
  @ApiProperty({ description: 'Actual location precision.', enum: ['gps', 'opisana', 'naselje'], example: 'naselje' })
  preciznost_lokacije!: AppPreciznostLokacije;
  @ApiProperty({ description: 'Problem size.', type: String, enum: ['mala', 'srednja', 'velika', null], nullable: true, example: 'srednja' })
  velicina!: AppVelicinaProblema | null;
  @ApiProperty({ description: 'Workflow status.', enum: REPORT_STATUSES, example: 'nova' })
  status!: ReportStatus;
  @ApiProperty({ description: 'Response selected by staff.', type: String, enum: [...RESPONSE_TYPES, null], nullable: true, example: null })
  tip_obrade!: ResponseType | null;
  @ApiProperty({ description: 'Manual priority, 1 most urgent; null until triaged.', type: Number, nullable: true, example: null })
  prioritet!: number | null;
  @ApiProperty({ description: 'Original report when marked duplicate.', type: String, nullable: true, example: null })
  duplikat_od!: string | null;
  @ApiProperty({ description: 'Current version required for a staff mutation.', example: 1 })
  verzija!: number;
  @ApiProperty({ description: 'Submission instant.', example: '2026-09-18T12:00:00.000Z', format: 'date-time' })
  primljena_at!: string;
  @ApiProperty({ description: 'Last change instant.', example: '2026-09-18T12:00:00.000Z', format: 'date-time' })
  azurirana_at!: string;
  @ApiProperty({ description: 'First confirmation instant.', type: String, nullable: true, example: null, format: 'date-time' })
  potvrdjena_at!: string | null;
  @ApiProperty({ description: 'Resolution instant.', type: String, nullable: true, example: null, format: 'date-time' })
  resena_at!: string | null;
}

const REPORT_EXAMPLE: ReportResponseDto = {
  id: '55555555-5555-4555-8555-555555555555', kratki_kod: 'PR-A1B2C3D4E5F6', kanal: 'web',
  tip: 'prelivanje', opis: null, tacka: null, naselje_id: 'aaaaaaaa-0002-4000-8000-000000000002',
  kontejner_id: null, kanonska_id: null, posrednik_id: null, opis_lokacije: null, preciznost_lokacije: 'naselje',
  velicina: null, status: 'nova', tip_obrade: null, prioritet: null, duplikat_od: null, verzija: 1,
  primljena_at: '2026-09-18T12:00:00.000Z', azurirana_at: '2026-09-18T12:00:00.000Z', potvrdjena_at: null, resena_at: null,
};

export class ReportHistoryDto {
  @ApiProperty({ description: 'Recorded action.', enum: ['kreirana', 'potvrdjena', 'odbijena', 'duplikat', 'resena'], example: 'potvrdjena' })
  akcija!: string;
  @ApiProperty({ description: 'Acting staff identifier; null for public submissions.', type: String, nullable: true, example: null })
  korisnik_id!: string | null;
  @ApiProperty({ description: 'Staff explanation.', type: String, nullable: true, example: 'Provereno telefonom.' })
  razlog!: string | null;
  @ApiProperty({ description: 'Version created by this action.', example: 2 })
  verzija!: number;
  @ApiProperty({ description: 'Action instant.', example: '2026-09-18T12:10:00.000Z', format: 'date-time' })
  nastalo_at!: string;
  @ApiProperty({ description: 'Report snapshot before the action.', oneOf: [{ $ref: getSchemaPath(ReportResponseDto) }, { type: 'object', nullable: true, enum: [null] }], example: null })
  prethodno!: ReportResponseDto | null;
  @ApiProperty({ description: 'Report snapshot after the action.', type: ReportResponseDto, example: REPORT_EXAMPLE })
  novo!: ReportResponseDto;
}

export class ReportDetailDto extends ReportResponseDto {
  @ApiProperty({ description: 'Immutable history ordered by report version.', type: [ReportHistoryDto] })
  istorija!: ReportHistoryDto[];

  @ApiProperty({ description: 'Attached photos, oldest first.', type: [PhotoDto] })
  fotografije!: PhotoDto[];

  @ApiProperty({
    description: 'Newest automatic triage proposal, or null when none has been produced. Advisory: the report is what staff decided, not what the classifier suggested.',
    type: ClassificationDto, nullable: true,
  })
  klasifikacija!: ClassificationDto | null;
}

/**
 * The queue row. Photos hang here and not on ReportResponseDto on purpose:
 * that class is also the snapshot shape stored in prijava_istorija, and copying
 * image URLs into every audit entry would bloat the trail without adding a fact
 * the history does not already carry.
 */
export class ReportListItemDto extends ReportResponseDto {
  @ApiProperty({ description: 'Attached photos, oldest first.', type: [PhotoDto] })
  fotografije!: PhotoDto[];

  @ApiProperty({
    description: 'Newest automatic triage proposal, so the queue can be sorted and pre-filled without opening every row.',
    type: ClassificationDto, nullable: true,
  })
  klasifikacija!: ClassificationDto | null;
}

export class ReportPageDto {
  @ApiProperty({ description: 'Reports ordered newest first, with UUID tie-breaker.', type: [ReportListItemDto] })
  items!: ReportListItemDto[];
  @ApiProperty({ description: 'Current page.', example: 1 })
  page!: number;
  @ApiProperty({ description: 'Requested maximum page size.', example: 25 })
  limit!: number;
  @ApiProperty({ description: 'Whether another page exists.', example: false })
  hasMore!: boolean;
}

export class LookupItemDto {
  @ApiProperty({ description: 'Reference identifier.', example: 'aaaaaaaa-0002-4000-8000-000000000002', format: 'uuid' })
  id!: string;
  @ApiProperty({ description: 'Settlement name, container label or intermediary name.', example: 'Krupac' })
  naziv!: string;
  @ApiPropertyOptional({ description: 'Container settlement identifier.', example: 'aaaaaaaa-0002-4000-8000-000000000002', format: 'uuid' })
  naselje_id?: string;
}

export class LookupPageDto {
  @ApiProperty({ description: 'Reference items without phone numbers or other private contact data.', type: [LookupItemDto] })
  items!: LookupItemDto[];
  @ApiProperty({ description: 'Current page.', example: 1 })
  page!: number;
  @ApiProperty({ description: 'Requested maximum page size.', example: 25 })
  limit!: number;
  @ApiProperty({ description: 'Whether another page exists.', example: false })
  hasMore!: boolean;
}
