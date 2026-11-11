import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

/**
 * A point, defined here rather than borrowed from routing: containers is
 * upstream of routing in the module map, and a shared DTO would be a dependency
 * pointing the wrong way. Same shape, deliberately.
 */
export class LokacijaDto {
  @ApiProperty({ description: 'Latitude, WGS84.', example: 43.116004 })
  @IsNumber()
  lat!: number;

  @ApiProperty({ description: 'Longitude, WGS84.', example: 22.675066 })
  @IsNumber()
  lon!: number;
}

/**
 * The container list has its own query object rather than the shared lookup one:
 * the map wants the sensored fleet in a single call, and 500 containers is that
 * call. The report wizard keeps using the same endpoint with the default page
 * size and without `sa_stanjem`, so its payload does not grow.
 */
export class ContainerQueryDto {
  @ApiPropertyOptional({ description: 'Result page, starting at 1.', example: 1, default: 1, minimum: 1, maximum: 100000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Maximum items per page.', example: 25, default: 25, minimum: 1, maximum: 500 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit: number = 25;

  @ApiPropertyOptional({ description: 'Case-insensitive search on the container label.', example: 'PI-KRU', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Only containers in this settlement.', example: 'aaaaaaaa-0002-4000-8000-000000000002', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  naselje_id?: string;

  @ApiPropertyOptional({
    description:
      'Include the current state and the forecast summary. Off by default, so the reference lookup used while filing a report stays small.',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  sa_stanjem?: boolean;

  @ApiPropertyOptional({ description: 'Only containers with a sensor mounted right now.', example: true })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  samo_sa_senzorom?: boolean;

  @ApiPropertyOptional({
    description: 'Only containers whose last reliable reading is at or above this percentage.',
    example: 80,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  min_fill?: number;

  @ApiPropertyOptional({
    description:
      'Only containers forecast to reach 95 % before this instant. Containers without a forecast are not included — nothing says they are critical.',
    example: '2026-09-21T06:00:00.000Z',
    format: 'date-time',
  })
  @IsOptional()
  @IsISO8601()
  kriticno_do?: string;
}

export class ContainerReadingsQueryDto {
  @ApiPropertyOptional({ description: 'How many days back to read.', example: 14, default: 14, minimum: 1, maximum: 45 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(45)
  dana: number = 14;

  @ApiPropertyOptional({ description: 'Maximum readings returned, oldest first.', example: 200, default: 200, minimum: 1, maximum: 1000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit: number = 200;
}

export class ContainerStanjeDto {
  @ApiProperty({
    description:
      'Last reliable fill level in percent, as of `measured_at`. Null means no trustworthy reading — never an empty container.',
    type: Number,
    example: 72,
    nullable: true,
  })
  fill_percent!: number | null;

  @ApiProperty({ description: 'When that reading was taken.', type: String, example: '2026-09-19T00:00:00.000Z', format: 'date-time', nullable: true })
  measured_at!: string | null;

  @ApiProperty({ description: 'Percentage points per day, as the cached state records it.', type: Number, example: 12.4, nullable: true })
  trend_pp_po_danu!: number | null;

  @ApiProperty({ description: 'Battery level in percent.', type: Number, example: 92, nullable: true })
  baterija_percent!: number | null;

  @ApiProperty({
    description: 'Device status codes. Anything other than a bare `ok` outranks the measurement.',
    type: [String],
    example: ['ok'],
  })
  aktivni_status!: string[];

  @ApiProperty({ description: 'Since when the device has been silent. Silence is a data gap, not an empty container.', type: String, example: null, format: 'date-time', nullable: true })
  tih_od!: string | null;

  @ApiProperty({
    description: 'Whether the reading may be acted on: no fault codes, not silent. A blocked sensor reads as full.',
    example: true,
  })
  pouzdano!: boolean;
}

export class ContainerPrognozaDto {
  @ApiProperty({ description: 'Expected time of reaching 95 %; a time in the past means it is over that level now.', type: String, example: '2026-09-22T14:20:00.000Z', format: 'date-time', nullable: true })
  vreme_kriticnog!: string | null;

  @ApiProperty({ description: 'The same, in hours from now. Negative when it is already critical.', type: Number, example: 56.3, nullable: true })
  sati_do_kriticnog!: number | null;

  @ApiProperty({ description: 'Forecast level in 24 hours, in percent.', type: Number, example: 61.5, nullable: true })
  ocekivano_24h!: number | null;

  @ApiProperty({ description: 'Forecast level in 48 hours, in percent.', type: Number, example: 74, nullable: true })
  ocekivano_48h!: number | null;

  @ApiProperty({ description: 'How much history stands behind the curve.', enum: ['visoka', 'srednja', 'niska'], example: 'visoka' })
  pouzdanost!: string;

  @ApiProperty({ description: 'Readings were missing in the fitted window.', example: false })
  ima_rupu!: boolean;

  @ApiProperty({ description: 'When the forecast was computed.', example: '2026-09-19T02:00:00.000Z', format: 'date-time' })
  izracunata_at!: string;

  @ApiProperty({ description: 'Last reading that fed it; older than the container’s newest reading means it is stale.', example: '2026-09-19T00:00:00.000Z', format: 'date-time' })
  ulazni_podaci_do!: string;
}

export class ContainerListItemDto {
  @ApiProperty({ description: 'Reference identifier.', example: 'cccccccc-0001-4000-8000-000000000001', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'The label on the physical unit.', example: 'PI-KRU-004' })
  naziv!: string;

  @ApiProperty({ description: 'Settlement identifier.', example: 'aaaaaaaa-0002-4000-8000-000000000002', format: 'uuid' })
  naselje_id!: string;

  @ApiPropertyOptional({ description: 'Collection point the container stands on. Only with `sa_stanjem`.', example: 'bbbbbbbb-0001-4000-8000-000000000001', format: 'uuid' })
  sabirno_mesto_id?: string;

  @ApiPropertyOptional({ description: 'Name of that collection point. Only with `sa_stanjem`.', example: 'Krupac - centar sela' })
  mesto_naziv?: string;

  @ApiPropertyOptional({ description: 'Waste stream. Only with `sa_stanjem`.', example: 'komunalni' })
  tip_otpada?: string;

  @ApiPropertyOptional({ description: 'Container volume in litres. Only with `sa_stanjem`.', example: 1100 })
  zapremina_l?: number;

  @ApiPropertyOptional({
    description:
      'Where the collection point is. Positions of village points are derived from settlement centroids, not surveyed (`docs/data-sources.md`). Only with `sa_stanjem`.',
    type: LokacijaDto,
    example: { lat: 43.116004, lon: 22.675066 },
  })
  lokacija?: LokacijaDto;

  @ApiPropertyOptional({ description: 'Whether a sensor is mounted right now. Only with `sa_stanjem`.', example: true })
  ima_senzor?: boolean;

  @ApiPropertyOptional({ description: 'Last detected emptying. Only with `sa_stanjem`.', type: String, example: '2026-09-16T05:00:00.000Z', format: 'date-time', nullable: true })
  poslednje_praznjenje?: string | null;

  @ApiPropertyOptional({ description: 'Overflow alarms in the last 90 days. Only with `sa_stanjem`.', example: 2 })
  prelivanja_90d?: number;

  @ApiPropertyOptional({
    description: 'Cached current state. Only with `sa_stanjem`.',
    type: ContainerStanjeDto,
    example: {
      fill_percent: 72,
      measured_at: '2026-09-19T00:00:00.000Z',
      trend_pp_po_danu: 12.4,
      baterija_percent: 92,
      aktivni_status: ['ok'],
      tih_od: null,
      pouzdano: true,
    },
  })
  stanje?: ContainerStanjeDto;

  @ApiPropertyOptional({
    description: 'Newest forecast, without the curve — `GET /containers/{id}/forecast` has that. Absent when there is none. Only with `sa_stanjem`.',
    type: ContainerPrognozaDto,
    example: {
      vreme_kriticnog: '2026-09-22T14:20:00.000Z',
      sati_do_kriticnog: 56.3,
      ocekivano_24h: 61.5,
      ocekivano_48h: 74,
      pouzdanost: 'visoka',
      ima_rupu: false,
      izracunata_at: '2026-09-19T02:00:00.000Z',
      ulazni_podaci_do: '2026-09-19T00:00:00.000Z',
    },
  })
  prognoza?: ContainerPrognozaDto;
}

export class ContainerPageDto {
  @ApiProperty({ description: 'Containers ordered by label.', type: [ContainerListItemDto] })
  items!: ContainerListItemDto[];

  @ApiProperty({ description: 'Current page.', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Requested maximum page size.', example: 25 })
  limit!: number;

  @ApiProperty({ description: 'Whether another page exists.', example: false })
  hasMore!: boolean;
}

export class ContainerReadingDto {
  @ApiProperty({ description: 'Device clock — the only timestamp that belongs on a fill curve.', example: '2026-09-19T00:00:00.000Z', format: 'date-time' })
  measured_at!: string;

  @ApiProperty({
    description: 'Fill level recomputed server-side from the mounting depth, in percent.',
    type: Number,
    example: 72,
    nullable: true,
  })
  fill_percent!: number | null;

  @ApiProperty({
    description: 'False when the reading carried a fault code. Such a reading is shown, but must not raise routing priority.',
    example: true,
  })
  pouzdano!: boolean;

  @ApiProperty({
    description: '`emptying` marks the collection that resets the curve; `tipped` is an incident.',
    type: String,
    example: 'upright',
    nullable: true,
  })
  orientation!: string | null;

  @ApiProperty({ description: 'Battery level in percent.', type: Number, example: 92, nullable: true })
  baterija_percent!: number | null;
}
