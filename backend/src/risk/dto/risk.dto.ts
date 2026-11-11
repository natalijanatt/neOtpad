import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/** The `preporuka` vocabulary of `app.crna_tacka`, as the migration comment fixes it. */
export const PREPORUKE = ['cesci_odvoz', 'dodati_kontejner', 'premestiti_kontejner', 'akcija_ciscenja', 'nadzor'] as const;

/**
 * A point, defined here rather than borrowed from containers or routing: a
 * shared DTO between feature modules is a dependency pointing sideways. Same
 * shape as `LokacijaDto` and `TackaDto`, deliberately.
 */
export class RiskLokacijaDto {
  @ApiProperty({ description: 'Latitude, WGS84.', example: 43.168282 })
  lat!: number;

  @ApiProperty({ description: 'Longitude, WGS84.', example: 22.595668 })
  lon!: number;
}

export class BlackSpotQueryDto {
  @ApiPropertyOptional({ description: 'Result page, starting at 1.', example: 1, default: 1, minimum: 1, maximum: 100000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Maximum items per page.', example: 25, default: 25, minimum: 1, maximum: 200 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 25;

  @ApiPropertyOptional({ description: 'Only black spots in this settlement.', example: 'aaaaaaaa-0002-4000-8000-000000000002', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  naselje_id?: string;

  @ApiPropertyOptional({ description: 'Only black spots carrying this recommendation.', enum: PREPORUKE, example: 'dodati_kontejner' })
  @IsOptional()
  @IsIn(PREPORUKE)
  preporuka?: string;

  @ApiPropertyOptional({
    description: 'Only spots recorded at least this many times. A single sighting is not yet a black spot.',
    example: 2,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  min_ponavljanja?: number;

  @ApiPropertyOptional({
    description:
      'Include closed black spots — those carried out or dismissed. Off by default: the list answers "what is still open", and a cleared ' +
      'spot returns to it only by recurring.',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  sve?: boolean;
}

export class BlackSpotRizikDto {
  @ApiProperty({ description: 'Risk score of the subject this spot is scored through.', example: 74.5 })
  skor!: number;

  @ApiProperty({ description: 'Risk band.', enum: ['nizak', 'srednji', 'visok', 'crna_tacka'], example: 'crna_tacka' })
  klasifikacija!: string;

  @ApiProperty({
    description:
      'Every contributing term of the score, keyed by name. Carried so the list can answer "why is this village on it" — a risk-weighted ' +
      'objective is only defensible if it is explainable.',
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { prelivanje: 0.6, ponavljanje: 0.9, pokrivenost: 0.4 },
  })
  komponente!: Record<string, number>;

  @ApiProperty({ description: 'When the score was computed.', example: '2026-09-19T03:00:00.000Z', format: 'date-time' })
  izracunato_at!: string;

  @ApiProperty({
    description:
      'Which subject carries the score: the canonical dump when the spot is linked to one, otherwise its settlement — the same fallback ' +
      'routing applies when a stop has no score of its own.',
    enum: ['kanonska_deponija', 'naselje'],
    example: 'kanonska_deponija',
  })
  subjekat_tip!: string;
}

export class BlackSpotDto {
  @ApiProperty({ description: 'Black spot identifier.', example: 'dddddddd-0001-4000-8000-000000000001', format: 'uuid' })
  id!: string;

  @ApiProperty({
    description: 'Settlement the spot belongs to.',
    type: String,
    example: 'aaaaaaaa-0002-4000-8000-000000000002',
    format: 'uuid',
    nullable: true,
  })
  naselje_id!: string | null;

  @ApiProperty({ description: 'Name of that settlement.', type: String, example: 'Krupac', nullable: true })
  naselje_naziv!: string | null;

  @ApiProperty({
    description: 'Canonical illegal dump the spot was derived from, when there is one.',
    type: String,
    example: 'eeeeeeee-0001-4000-8000-000000000001',
    format: 'uuid',
    nullable: true,
  })
  kanonska_id!: string | null;

  @ApiProperty({
    description:
      'Where the spot is: the canonical dump’s point when it is linked to one, otherwise its own. Null when neither exists — the Eko Alert ' +
      'placeholder coordinate is never returned as a location.',
    type: RiskLokacijaDto,
    example: { lat: 43.168282, lon: 22.595668 },
    nullable: true,
  })
  lokacija!: RiskLokacijaDto | null;

  @ApiProperty({
    description:
      'How well the position is known — the canonical dump’s own flag, or `geokodirano` for a spot that only has a derived point. ' +
      '`nepoznato` means the position is not established and must not be drawn as a surveyed one; a centroid locates a village, not a ' +
      'spot (`docs/data-sources.md`).',
    enum: ['registarska_tacka', 'geokodirano', 'centroid_naselja', 'nepoznato'],
    example: 'registarska_tacka',
  })
  geo_preciznost!: string;

  @ApiProperty({ description: 'First time the spot was recorded.', type: String, example: '2019-04-11', format: 'date', nullable: true })
  prvi_put!: string | null;

  @ApiProperty({ description: 'Most recent time it was recorded.', type: String, example: '2026-07-02', format: 'date', nullable: true })
  poslednji_put!: string | null;

  @ApiProperty({ description: 'How many times it has been recorded. Recurrence is what makes a location a black spot.', example: 4 })
  broj_ponavljanja!: number;

  @ApiProperty({
    description: 'What to do about it. A black spot carries an action, never only a colour on a map.',
    enum: PREPORUKE,
    example: 'dodati_kontejner',
  })
  preporuka!: string;

  @ApiProperty({
    description: 'Why this recommendation, in words a dispatcher can argue with.',
    example: 'Čišćeno 2024. i 2025, ponovo se stvara; najbliži kontejner je 2.4 km daleko.',
  })
  obrazlozenje!: string;

  @ApiProperty({ description: 'Workflow state of the recommendation.', example: 'predlozeno' })
  status!: string;

  @ApiProperty({ description: 'When the recommendation was carried out.', type: String, example: null, format: 'date-time', nullable: true })
  sprovedeno_at!: string | null;

  @ApiProperty({
    description: 'Newest risk score behind the spot. Null while the risk recalculator has not scored its subject yet.',
    type: BlackSpotRizikDto,
    nullable: true,
    example: {
      skor: 74.5,
      klasifikacija: 'crna_tacka',
      komponente: { prelivanje: 0.6, ponavljanje: 0.9, pokrivenost: 0.4 },
      izracunato_at: '2026-09-19T03:00:00.000Z',
      subjekat_tip: 'kanonska_deponija',
    },
  })
  rizik!: BlackSpotRizikDto | null;
}

export class BlackSpotPageDto {
  @ApiProperty({ description: 'Black spots, most urgent first.', type: [BlackSpotDto] })
  items!: BlackSpotDto[];

  @ApiProperty({ description: 'Current page.', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Requested maximum page size.', example: 25 })
  limit!: number;

  @ApiProperty({ description: 'Whether another page exists.', example: false })
  hasMore!: boolean;
}
