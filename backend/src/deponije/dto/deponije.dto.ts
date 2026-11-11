import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/**
 * A point, defined here rather than borrowed from another feature module: a DTO
 * shared sideways is a dependency pointing sideways. Same shape as the others,
 * deliberately.
 */
export class DumpLokacijaDto {
  @ApiProperty({ description: 'Latitude, WGS84.', example: 43.116004 })
  lat!: number;

  @ApiProperty({ description: 'Longitude, WGS84.', example: 22.675066 })
  lon!: number;
}

export class DumpQueryDto {
  @ApiPropertyOptional({ description: 'Result page, starting at 1.', example: 1, default: 1, minimum: 1, maximum: 100000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Maximum items per page. The whole Pirot record is well under one page, so the map fetches it in a single call.',
    example: 100,
    default: 100,
    minimum: 1,
    maximum: 500,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit: number = 100;

  @ApiPropertyOptional({ description: 'Only dumps matched to this settlement.', example: 'aaaaaaaa-0002-4000-8000-000000000002', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  naselje_id?: string;

  @ApiPropertyOptional({
    description:
      'Only dumps that have a coordinate. A map wants this; a count of the record does not, because dropping the unlocated ones ' +
      'undercounts the register.',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  sa_lokacijom?: boolean;

  @ApiPropertyOptional({
    description:
      'Include cleared and remediated sites too — the whole register rather than what still stands. Off by default: the map asks ' +
      'what is there now, and a cleared site that has not come back is not.',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  sve?: boolean;
}

export class DumpDto {
  @ApiProperty({ description: 'Row identifier.', example: 'eeeeeeee-0001-4000-8000-000000000001', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'The identity the register and the UI quote.', example: 'K-07' })
  kanonski_id!: string;

  @ApiProperty({ description: 'Name as the sources give it; several merged names are joined with " | ".', type: String, example: 'Divlja deponija Krupac (43.1160, 22.6751) | Krupac', nullable: true })
  naziv!: string | null;

  @ApiProperty({ description: 'Settlement it was matched to, when the name could be resolved.', type: String, example: 'aaaaaaaa-0002-4000-8000-000000000002', format: 'uuid', nullable: true })
  naselje_id!: string | null;

  @ApiProperty({ description: 'Name of that settlement.', type: String, example: 'Krupac', nullable: true })
  naselje_naziv!: string | null;

  @ApiProperty({
    description:
      'Where it is. Null exactly when `geo_preciznost` is `nepoznato`: a dump whose location was never recorded is not drawable, and the ' +
      'Eko Alert placeholder coordinate is not a location (`docs/data-sources.md`).',
    type: DumpLokacijaDto,
    example: { lat: 43.116004, lon: 22.675066 },
    nullable: true,
  })
  lokacija!: DumpLokacijaDto | null;

  @ApiProperty({
    description:
      'How the coordinate was obtained. Only `registarska_tacka` is a surveyed point; a centroid locates the village, not the dump, and ' +
      'must not be rendered as if someone had stood on it.',
    enum: ['registarska_tacka', 'geokodirano', 'centroid_naselja', 'nepoznato'],
    example: 'registarska_tacka',
  })
  geo_preciznost!: string;

  @ApiProperty({ description: 'First year it appears in any source.', type: Number, example: 2018, nullable: true })
  prvi_put_zabelezena!: number | null;

  @ApiProperty({ description: 'Last year it appears in any source.', type: Number, example: 2021, nullable: true })
  poslednji_put_zabelezena!: number | null;

  @ApiProperty({
    description:
      'Every year it was recorded. A gap is not evidence it was gone: 2017 has no Pirot rows at all and the 2018 locations never ' +
      'reappear, which is a change of reporting method rather than a drop in dumping.',
    type: [Number],
    example: [2018, 2020, 2021],
  })
  godine_evidentirana!: number[];

  @ApiProperty({ description: 'Which datasets it came from.', type: [String], example: ['LPUO', 'SEPA'] })
  izvori!: string[];

  @ApiProperty({ description: 'Source rows merged into this one site.', example: 2 })
  broj_izvornih_redova!: number;

  @ApiProperty({
    description:
      'Dated observations underneath it. A lower bound, never a count of dumps: one row can read "a dozen dumps near Izvor".',
    example: 2,
  })
  broj_opservacija!: number;

  @ApiProperty({
    description:
      'Confirmed citizen reports filed against this site. Separate from `broj_opservacija` on purpose: that one counts what the CSV ' +
      'import owns and may never be added to this, because a count of reports grows with app adoption rather than with dumping ' +
      '(`docs/data-sources.md`).',
    example: 0,
  })
  broj_prijava!: number;

  @ApiProperty({ description: 'Most recent confirmed report about it.', type: String, nullable: true, example: null, format: 'date' })
  poslednja_prijava_at!: string | null;

  @ApiProperty({ description: 'Whether it refills after being cleared — the signal that turns a site into a black spot.', enum: ['da', 'ne', 'nepoznato'], example: 'da' })
  ponovo_se_stvara!: string;

  @ApiProperty({ description: 'Status verbatim from the sources, not a vocabulary.', type: String, example: 'nije prijavljena posle 2018; evidentirana u LPUO 2021-2031', nullable: true })
  status!: string | null;

  @ApiProperty({
    description:
      '`status` reduced to the five states the register actually distinguishes, read off the leading clause. Derived here rather than ' +
      'in every client, because the same reduction is what `sve=false` filters on.',
    enum: ['aktivna', 'prijavljeno', 'evidentirana', 'ocisceno', 'u_sanaciji'],
    example: 'evidentirana',
  })
  stanje!: string;

  @ApiProperty({
    description:
      'Whether the site still stands. False only for a cleared or remediated one — and a cleared site whose sources say it refills is ' +
      'true again, because the LPUO records that a cleared site returns unless a container replaces it. Absence from later reports is ' +
      'not closure: the 2017/2018 break is a change of reporting method (`docs/data-sources.md`).',
    example: true,
  })
  aktivna!: boolean;

  @ApiProperty({
    description: 'How confident the merge of the source rows was. `srednja` has to stay visible: it is one site only if the reasoning holds.',
    type: String,
    enum: ['visoka', 'srednja', 'niska'],
    example: 'visoka',
    nullable: true,
  })
  spajanje_pouzdanost!: string | null;

  @ApiProperty({
    description: 'Largest area any merged source row reports, in m². The sources disagree, so this is a maximum rather than a sum.',
    type: Number,
    example: 26332,
    nullable: true,
  })
  povrsina_m2!: number | null;

  @ApiProperty({ description: 'Largest reported volume, in m³.', type: Number, example: 150, nullable: true })
  zapremina_m3!: number | null;

  @ApiProperty({ description: 'Largest reported quantity, in tonnes.', type: Number, example: 10, nullable: true })
  kolicina_t!: number | null;

  @ApiProperty({ description: 'Most recent clean-up recorded on any merged source row.', type: String, example: '2024-07-24', format: 'date', nullable: true })
  ociscena_datum!: string | null;
}

export class DumpPageDto {
  @ApiProperty({ description: 'Canonical dumps, ordered by their register id.', type: [DumpDto] })
  items!: DumpDto[];

  @ApiProperty({ description: 'Current page.', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Requested maximum page size.', example: 100 })
  limit!: number;

  @ApiProperty({ description: 'Whether another page exists.', example: false })
  hasMore!: boolean;
}
