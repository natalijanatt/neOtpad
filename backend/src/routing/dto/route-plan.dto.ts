import { ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import type { AppTipOtpada } from '../../database/generated/schema';
import {
  DEFAULT_PARAMETERS,
  DEFAULT_WEIGHTS,
  type RazlogNepokrivenosti,
  type RazlogStajalista,
} from '../optimizer/route-optimizer.port';
import { CiljFunkcijaDto } from './objective.dto';

const TIPOVI_OTPADA: readonly AppTipOtpada[] = [
  'komunalni',
  'pet',
  'staklo',
  'papir',
  'metal',
  'bio',
  'kabasti',
  'gradjevinski',
  'suvi_reciklabilni',
];

export const RAZLOZI_STAJALISTA: readonly RazlogStajalista[] = [
  'prelivanje_rizik',
  'rizik_divlje_deponije',
  'prijava',
  'rutinski',
  'bez_senzora',
  'domacinstva',
  'usput',
];

export const RAZLOZI_NEPOKRIVENOSTI: readonly RazlogNepokrivenosti[] = ['kapacitet', 'radno_vreme', 'nema_vozila'];

export class TackaDto {
  @ApiProperty({ description: 'Latitude, WGS84.', example: 43.116004 })
  lat!: number;

  @ApiProperty({ description: 'Longitude, WGS84.', example: 22.675066 })
  lon!: number;
}

export class PrioritetKomponentaDto {
  @ApiProperty({ description: 'The term itself, 0..1.', example: 0.8, minimum: 0, maximum: 1 })
  vrednost!: number;

  @ApiProperty({ description: 'The term times its weight: what it added to the priority.', example: 0.28, minimum: 0 })
  doprinos!: number;
}

const KOMPONENTE_EXAMPLE = {
  prelivanje: { vrednost: 0.8, doprinos: 0.28 },
  rizik: { vrednost: 0.4, doprinos: 0.08 },
  prijava: { vrednost: 0, doprinos: 0 },
  pokrivenost: { vrednost: 0, doprinos: 0 },
  domacinstva: { vrednost: 0.56, doprinos: 0.028 },
  rutinski: { vrednost: 0, doprinos: 0 },
  bez_senzora: { vrednost: 0, doprinos: 0 },
};

/**
 * One container at a stop, scored on its own. The sensor is on the container,
 * not the collection point, so this is where "why is this bin being emptied"
 * actually gets answered — the stop-level fields below are the worst of these.
 */
export class KontejnerStopDto {
  @ApiProperty({ description: 'Container id.', example: 'cccccccc-0002-4000-8000-000000000002', format: 'uuid' })
  kontejnerId!: string;

  @ApiProperty({ description: 'The label on the physical unit.', example: 'PI-TIJ-001' })
  oznaka!: string;

  @ApiProperty({ description: 'Waste stream this container collects.', enum: TIPOVI_OTPADA, example: 'komunalni' })
  tipOtpada!: AppTipOtpada;

  @ApiProperty({
    description:
      "Fill level the truck should expect on arrival, 0..100. Meaningless when imaOcitavanje is false — 0 there " +
      'means no trustworthy reading exists, never a measured empty container.',
    example: 92,
    minimum: 0,
    maximum: 100,
  })
  ocekivanoPunjenje!: number;

  @ApiProperty({
    description:
      'Whether ocekivanoPunjenje is a real, trustworthy measurement. False for a container with no sensor mounted ' +
      'or whose last reading carried a diagnostic fault — sensor-telemetry.md: a missing reading is a gap, never a ' +
      "reassuring 0%. Render 'no data', not a fill bar, when this is false.",
    example: true,
  })
  imaOcitavanje!: boolean;

  @ApiProperty({
    description: 'The single strongest reason this container is on the list.',
    enum: RAZLOZI_STAJALISTA,
    example: 'prelivanje_rizik',
  })
  razlog!: RazlogStajalista;

  @ApiProperty({ description: "This container's own weighted priority.", example: 0.435, minimum: 0 })
  prioritet!: number;

  @ApiProperty({
    description:
      'Whether this container alone forces the stop, regardless of distance: forecast critical within 48h, a ' +
      'reliable reading ≥80%, an open confirmed report, or prioritet at or above tezine.prag_obaveznog.',
    example: true,
  })
  obavezno!: boolean;

  @ApiProperty({
    description: 'Every term of the priority function for this container. Keys are the term names.',
    type: 'object',
    additionalProperties: { $ref: getSchemaPath(PrioritetKomponentaDto) },
    example: KOMPONENTE_EXAMPLE,
  })
  komponente!: Record<string, PrioritetKomponentaDto>;

  @ApiPropertyOptional({
    description: 'The confirmed citizen report about this specific container, if any.',
    example: 'eeeeeeee-0001-4000-8000-000000000001',
    format: 'uuid',
  })
  prijavaId?: string;
}

/** Where a stop is and why it is there. Shared by planned and uncovered stops. */
export class StopLocationDto {
  @ApiProperty({ description: 'Collection point this stop serves.', example: 'bbbbbbbb-0001-4000-8000-000000000001', format: 'uuid' })
  sabirnoMestoId!: string;

  @ApiProperty({ description: 'Settlement of the collection point.', example: 'aaaaaaaa-0002-4000-8000-000000000002', format: 'uuid' })
  naseljeId!: string;

  @ApiProperty({ description: 'Name of the collection point.', example: 'Krupac - centar sela' })
  naziv!: string;

  @ApiProperty({ description: 'Latitude of the collection point, WGS84.', example: 43.116004 })
  lat!: number;

  @ApiProperty({ description: 'Longitude of the collection point, WGS84.', example: 22.675066 })
  lon!: number;

  @ApiProperty({
    description: 'The single strongest reason this stop is on the list.',
    enum: RAZLOZI_STAJALISTA,
    example: 'prelivanje_rizik',
  })
  razlog!: RazlogStajalista;

  @ApiProperty({ description: 'Weighted priority; the sum of every component contribution.', example: 0.388, minimum: 0 })
  prioritet!: number;

  @ApiProperty({
    description:
      "This stop's worst container's obavezno. When true, the stop was placed regardless of detour cost. When " +
      'false, it competed on prioritet ÷ marginal-minutes-at-insertion against tezine.min_odnos — see doprinosCeniMin.',
    example: false,
  })
  obavezno!: boolean;

  @ApiProperty({
    description: 'Every term of the priority function, so the UI can say why. Keys are the term names.',
    type: 'object',
    additionalProperties: { $ref: getSchemaPath(PrioritetKomponentaDto) },
    example: KOMPONENTE_EXAMPLE,
  })
  komponente!: Record<string, PrioritetKomponentaDto>;

  @ApiPropertyOptional({
    description: "The confirmed citizen report behind the stop's top reason, if any.",
    example: 'eeeeeeee-0001-4000-8000-000000000001',
    format: 'uuid',
  })
  prijavaId?: string;

  @ApiProperty({
    description:
      'The containers at this stop with their own reason to be there (prioritet at or above tezine.min_odnos), ' +
      "each scored on its own — the sensor is on the container, not the collection point. The truck still empties " +
      'every container physically present regardless of this list; a container below the threshold is left out here ' +
      'only because it explains nothing about why the stop exists. Never empty: the container that put the stop on ' +
      "the route is always included, even if that alone is below the threshold. The fields above are this list's " +
      'worst entry.',
    type: [KontejnerStopDto],
  })
  kontejneri!: KontejnerStopDto[];
}

export class RouteStopDto extends StopLocationDto {
  @ApiProperty({ description: 'Position in the route, starting at 1.', example: 1, minimum: 1 })
  redosled!: number;

  @ApiProperty({
    description:
      'Fill level the truck should expect on arrival, 0..100 — the highest reading among this stop\'s containers. ' +
      'Meaningless when imaOcitavanje is false.',
    example: 85,
    minimum: 0,
    maximum: 100,
  })
  ocekivanoPunjenje!: number;

  @ApiProperty({
    description: "Whether ocekivanoPunjenje is real: true when at least one of this stop's containers has a trustworthy reading.",
    example: true,
  })
  imaOcitavanje!: boolean;

  @ApiProperty({ description: 'Planned arrival, ISO 8601.', example: '2026-09-19T06:32:00.000Z', format: 'date-time' })
  planiraniDolazak!: string;

  @ApiProperty({ description: 'Minutes the route grew by when this stop was added.', example: 17.4, minimum: 0 })
  doprinosCeniMin!: number;
}

export class UncoveredStopDto extends StopLocationDto {
  @ApiProperty({
    description: 'Which constraint left this must-visit stop out of every route.',
    enum: RAZLOZI_NEPOKRIVENOSTI,
    example: 'radno_vreme',
  })
  razlogNepokrivenosti!: RazlogNepokrivenosti;
}

export class RoutePlanDto {
  @ApiProperty({ description: 'Plan id.', example: 'ffffffff-0001-4000-8000-000000000001', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'The day the plan is for, YYYY-MM-DD.', example: '2026-09-19' })
  datum!: string;

  @ApiProperty({ description: 'Vehicle the plan is for.', example: 'eeeeeeee-0001-4000-8000-000000000001', format: 'uuid' })
  voziloId!: string;

  @ApiProperty({ description: 'The vehicle label as painted on it.', example: 'PI 021-AB' })
  voziloOznaka!: string;

  @ApiProperty({ description: 'Plans are generated as a proposal and approved by a dispatcher.', example: 'predlog' })
  status!: string;

  @ApiProperty({ description: 'The optimiser that produced the plan.', example: 'greedy-risk-aware-v1' })
  algoritam!: string;

  @ApiProperty({ description: 'When the plan was generated, ISO 8601.', example: '2026-09-19T04:00:00.000Z', format: 'date-time' })
  generisanAt!: string;

  @ApiProperty({ description: 'Total distance, depot to depot, in metres.', example: 48210, minimum: 0 })
  ukupnaDistancaM!: number;

  @ApiProperty({ description: 'Total duration including stops, in minutes.', example: 176, minimum: 0 })
  ukupnoTrajanjeMin!: number;

  @ApiProperty({ description: 'Stops in visiting order.', type: [RouteStopDto] })
  stajalista!: RouteStopDto[];

  @ApiProperty({ description: 'Depot, every stop in order, depot again — for drawing the route.', type: [TackaDto] })
  putanja!: TackaDto[];

  @ApiProperty({
    description: "The weights and cost model this plan's stops were scored and inserted with.",
    type: CiljFunkcijaDto,
    example: { tezine: DEFAULT_WEIGHTS, parametri: DEFAULT_PARAMETERS },
  })
  ciljFunkcija!: CiljFunkcijaDto;
}

export class GeneratePlanResponseDto {
  @ApiProperty({ description: 'The day that was planned, YYYY-MM-DD.', example: '2026-09-19' })
  datum!: string;

  @ApiProperty({ description: 'One plan per active vehicle that received at least one stop.', type: [RoutePlanDto] })
  planovi!: RoutePlanDto[];

  @ApiProperty({
    description: 'Must-visit stops no vehicle could take. Reported so a dispatcher can act, never silently dropped.',
    type: [UncoveredStopDto],
  })
  nepokriveno!: UncoveredStopDto[];

  @ApiProperty({ description: 'Optional stops left for another day because the detour was not worth it.', example: 12, minimum: 0 })
  preskoceno!: number;

  @ApiProperty({
    description:
      'The optional stops themselves, with their priority and why they scored that — so "why isn\'t X on the route" ' +
      'never needs a database query. A stop here was seen and scored, just not worth the detour today.',
    type: [StopLocationDto],
  })
  preskocenaLista!: StopLocationDto[];

  @ApiProperty({
    description: 'The weights and cost model the plans were built with.',
    type: CiljFunkcijaDto,
    example: { tezine: DEFAULT_WEIGHTS, parametri: DEFAULT_PARAMETERS },
  })
  ciljFunkcija!: CiljFunkcijaDto;
}
