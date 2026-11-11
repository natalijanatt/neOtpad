import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsNumber, IsString, Matches, Min } from 'class-validator';
import { DEFAULT_PARAMETERS, DEFAULT_WEIGHTS } from '../optimizer/route-optimizer.port';

/**
 * Keys are the `cilj_funkcija` JSON keys, deliberately — this DTO is what gets
 * stored, so a plan can be re-read with the exact weights it was built from.
 * See docs/routing-heuristic.md for what each term measures.
 */
export class ObjectiveWeightsDto {
  @ApiProperty({ description: 'Weight of the overflow-forecast term.', example: DEFAULT_WEIGHTS.prelivanje, minimum: 0 })
  @IsNumber()
  @Min(0)
  prelivanje!: number;

  @ApiProperty({ description: 'Weight of the illegal-dump risk score.', example: DEFAULT_WEIGHTS.rizik, minimum: 0 })
  @IsNumber()
  @Min(0)
  rizik!: number;

  @ApiProperty({ description: 'Weight of an open, confirmed citizen report.', example: DEFAULT_WEIGHTS.prijava, minimum: 0 })
  @IsNumber()
  @Min(0)
  prijava!: number;

  @ApiProperty({
    description: 'Weight of the settlement being outside organised collection.',
    example: DEFAULT_WEIGHTS.pokrivenost,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  pokrivenost!: number;

  @ApiProperty({ description: 'Weight of the households the point serves.', example: DEFAULT_WEIGHTS.domacinstva, minimum: 0 })
  @IsNumber()
  @Min(0)
  domacinstva!: number;

  @ApiProperty({ description: 'Weight of the fixed schedule landing on this day.', example: DEFAULT_WEIGHTS.rutinski, minimum: 0 })
  @IsNumber()
  @Min(0)
  rutinski!: number;

  @ApiProperty({
    description: 'Weight of an unsensored point approaching its collection cycle.',
    example: DEFAULT_WEIGHTS.bez_senzora,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  bez_senzora!: number;

  @ApiProperty({
    description: 'Priority at or above which a stop is served regardless of distance.',
    example: DEFAULT_WEIGHTS.prag_obaveznog,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  prag_obaveznog!: number;

  @ApiProperty({
    description: 'Minimum priority per marginal minute for an optional stop to be worth the detour.',
    example: DEFAULT_WEIGHTS.min_odnos,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  min_odnos!: number;
}

export class RoutingParametersDto {
  @ApiProperty({ description: 'Road distance ≈ straight line × this factor.', example: DEFAULT_PARAMETERS.faktor_puta, minimum: 1 })
  @IsNumber()
  @Min(1)
  faktor_puta!: number;

  @ApiProperty({ description: 'Average driving speed, km/h.', example: DEFAULT_PARAMETERS.brzina_kmh, minimum: 1 })
  @IsNumber()
  @Min(1)
  brzina_kmh!: number;

  @ApiProperty({ description: 'Minutes spent at a stop.', example: DEFAULT_PARAMETERS.trajanje_stajanja_min, minimum: 0 })
  @IsNumber()
  @Min(0)
  trajanje_stajanja_min!: number;

  @ApiProperty({
    description: 'Extra minutes per additional container at the same stop.',
    example: DEFAULT_PARAMETERS.trajanje_po_kontejneru_min,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  trajanje_po_kontejneru_min!: number;

  @ApiProperty({
    description: 'Compactor ratio: collected volume divided by this is what the truck body holds.',
    example: DEFAULT_PARAMETERS.koeficijent_sabijanja,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  koeficijent_sabijanja!: number;

  @ApiProperty({ description: 'Shift length in minutes, return to the depot included.', example: DEFAULT_PARAMETERS.radno_vreme_min, minimum: 1 })
  @IsNumber()
  @Min(1)
  radno_vreme_min!: number;

  @ApiProperty({ description: 'Shift start, HH:MM local time.', example: DEFAULT_PARAMETERS.pocetak_smene, pattern: '^\\d{2}:\\d{2}$' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  pocetak_smene!: string;
}

/** What a request may override; anything omitted keeps the default. */
export class ObjectiveWeightsOverrideDto extends PartialType(ObjectiveWeightsDto) {}

export class RoutingParametersOverrideDto extends PartialType(RoutingParametersDto) {}

/** Stored verbatim as `plan_rute.cilj_funkcija`. */
export class CiljFunkcijaDto {
  // Examples on the $ref properties too: the Prism mock the frontend develops
  // against serves them, and contract:lint fails a property without one.
  @ApiProperty({
    description: 'Priority weights and thresholds the plan was built with.',
    type: ObjectiveWeightsDto,
    example: DEFAULT_WEIGHTS,
  })
  tezine!: ObjectiveWeightsDto;

  @ApiProperty({
    description: 'Cost-model parameters the plan was built with.',
    type: RoutingParametersDto,
    example: DEFAULT_PARAMETERS,
  })
  parametri!: RoutingParametersDto;
}
