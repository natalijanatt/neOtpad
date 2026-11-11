import { ApiProperty } from '@nestjs/swagger';

export class SerijaTackaDto {
  @ApiProperty({ description: 'Instant this point describes.', example: '2026-09-19T06:00:00.000Z', format: 'date-time' })
  t!: string;

  @ApiProperty({ description: 'Low end of the band: the slowest rate this container has shown.', example: 31.2, minimum: 0, maximum: 100 })
  p10!: number;

  @ApiProperty({ description: 'The forecast itself, in percent.', example: 38.5, minimum: 0, maximum: 100 })
  p50!: number;

  @ApiProperty({ description: 'High end of the band: the fastest rate this container has shown.', example: 45.9, minimum: 0, maximum: 100 })
  p90!: number;
}

export class ForecastDto {
  @ApiProperty({ description: 'When this forecast was computed.', example: '2026-09-19T02:00:00.000Z', format: 'date-time' })
  izracunata_at!: string;

  @ApiProperty({ description: 'End of the forecast horizon.', example: '2026-09-26T02:00:00.000Z', format: 'date-time' })
  horizont_do!: string;

  @ApiProperty({
    description: 'Last reading that fed the forecast. Older than the container’s newest reading means the forecast is stale.',
    example: '2026-09-19T00:00:00.000Z',
    format: 'date-time',
  })
  ulazni_podaci_do!: string;

  @ApiProperty({
    description: 'Forecast curve, one point per six hours, first point at the moment of computation.',
    type: [SerijaTackaDto],
  })
  serija!: SerijaTackaDto[];

  @ApiProperty({
    description:
      'When the container is expected to reach 95 %, the level at which it counts as overflowing. ' +
      'A time in the past means it is over that level now. Null when the curve does not reach it inside the horizon. ' +
      'The curve is free-running: it assumes nobody collects, so a scheduled collection does not clear this field.',
    type: String,
    example: '2026-09-22T14:20:00.000Z',
    format: 'date-time',
    nullable: true,
  })
  vreme_kriticnog!: string | null;

  @ApiProperty({
    description: 'Readings were missing in the fitted window. Gaps are marked, never interpolated away.',
    example: false,
  })
  ima_rupu!: boolean;

  @ApiProperty({ description: 'Model and the parameters it ran with.', example: 'hibrid-v1(prag=95,horizont=168h,korak=6h,k=4)' })
  model_verzija!: string;

  @ApiProperty({
    description: 'How much history stands behind the curve. Low means little history, a gap, or an untrustworthy device.',
    enum: ['visoka', 'srednja', 'niska'],
    example: 'visoka',
  })
  pouzdanost!: string;
}

export class ContainerForecastDto {
  @ApiProperty({ description: 'Container the forecast belongs to.', example: 'cccccccc-0002-4000-8000-000000000002', format: 'uuid' })
  kontejner_id!: string;

  @ApiProperty({
    description:
      'The newest forecast, or null when there is none: a container with no sensor, or one whose history is too short ' +
      'for a slope. Null is not "empty" — it means the fill level is unknown, and routing covers such a container ' +
      'through its `bez_senzora` term instead.',
    type: ForecastDto,
    nullable: true,
  })
  prognoza!: ForecastDto | null;
}
