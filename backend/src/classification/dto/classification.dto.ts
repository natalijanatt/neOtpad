import { ApiProperty } from '@nestjs/swagger';
import type { AppIshodKlasifikacije, AppPodkategorijaPrijave, AppStatusKlasifikacije, AppTipPrijave, AppVelicinaProblema } from '../../database/generated/schema';
import { REPORT_TYPES, RESPONSE_TYPES, type ResponseType } from '../../reports/vocabulary';
import { PODKATEGORIJE } from '../taxonomy';

/**
 * Why the proposal says what it says.
 *
 * A typed object rather than free-form JSON: this is what the dispatcher's UI
 * renders beside the suggestion ("18 m from container K-102, 91 % full"), and a
 * shape the frontend cannot derive from the contract is a shape it will not
 * show.
 */
export class ClassificationSignalsDto {
  @ApiProperty({ description: 'Nearest candidate container, if any was found.', type: String, nullable: true, example: 'cccccccc-0001-4000-8000-000000000001' })
  najblizi_kontejner_id!: string | null;
  @ApiProperty({ description: 'Metres to that container; null when the report has no coordinates.', type: Number, nullable: true, example: 18 })
  najblizi_kontejner_m!: number | null;
  @ApiProperty({ description: 'Its last reliable fill reading. Null means no sensor or a faulted one, never an empty container.', type: Number, nullable: true, example: 91 })
  najblizi_kontejner_punjenje!: number | null;
  @ApiProperty({ description: 'How many containers the classifier was allowed to choose from.', example: 3 })
  broj_kandidata_kontejnera!: number;
  @ApiProperty({ description: 'Organised collection in the settlement.', type: String, enum: ['da', 'ne', 'nepoznato', null], nullable: true, example: 'ne' })
  pokrivenost!: string | null;
  @ApiProperty({ description: 'Metres to the nearest recorded black spot.', type: Number, nullable: true, example: 40 })
  crna_tacka_m!: number | null;
  @ApiProperty({ description: 'Metres to the nearest illegal dump in the historical registry; settlement-centroid records are excluded.', type: Number, nullable: true, example: null })
  kanonska_deponija_m!: number | null;
  @ApiProperty({ description: 'Photos the classifier could look at.', example: 1 })
  broj_fotografija!: number;
  @ApiProperty({ description: 'Nearby open reports offered as duplicate candidates.', example: 2 })
  kandidata_za_duplikat!: number;
}

export class ClassificationDto {
  @ApiProperty({ description: 'Queue state of this proposal.', enum: ['na_cekanju', 'uspesna', 'neuspesna', 'zastarela'], example: 'uspesna' })
  status!: AppStatusKlasifikacije;

  @ApiProperty({ description: 'Which classifier answered. Rules run without an API key and after the model fails.', type: String, enum: ['pravila', 'model', null], nullable: true, example: 'model' })
  izvor!: 'pravila' | 'model' | null;

  @ApiProperty({ description: 'Model or ruleset that produced the proposal.', type: String, nullable: true, example: 'gpt-4o-mini' })
  model!: string | null;

  @ApiProperty({ description: 'Report version this proposal was computed for; it is stale for any later version.', example: 1 })
  prijava_verzija!: number;

  @ApiProperty({ description: 'Proposed problem type.', type: String, enum: [...REPORT_TYPES, null], nullable: true, example: 'prelivanje' })
  predlozeni_tip!: AppTipPrijave | null;

  @ApiProperty({ description: 'Proposed sub-category; decides which crew and which machinery.', type: String, enum: [...PODKATEGORIJE, null], nullable: true, example: 'komunalni_otpad' })
  predlozena_podkategorija!: AppPodkategorijaPrijave | null;

  @ApiProperty({ description: 'Proposed size.', type: String, enum: ['mala', 'srednja', 'velika', null], nullable: true, example: 'srednja' })
  predlozena_velicina!: AppVelicinaProblema | null;

  @ApiProperty({ description: 'Proposed response category, already checked against the rules staff triage enforces.', type: String, enum: [...RESPONSE_TYPES, null], nullable: true, example: 'odvoz' })
  predlozeni_tip_obrade!: ResponseType | null;

  @ApiProperty({ description: 'Which service this routes to, derived from the response and the sub-category.', example: 'JKP - redovna posada kamiona' })
  nadlezna_sluzba!: string;

  @ApiProperty({ description: 'Proposed priority, 1 most urgent through 5.', type: Number, nullable: true, example: 2 })
  predlozeni_prioritet!: number | null;

  @ApiProperty({ description: 'Proposed container; only ever one that was offered as a candidate.', type: String, nullable: true, example: 'cccccccc-0001-4000-8000-000000000001' })
  predlozeni_kontejner_id!: string | null;

  @ApiProperty({ description: 'Report this one may be repeating; advisory, the duplicate decision stays with staff.', type: String, nullable: true, example: null })
  predlozeni_duplikat_od!: string | null;

  @ApiProperty({ description: 'Confidence from 0 to 1. Corrected proposals are capped at 0.5.', type: Number, nullable: true, example: 0.82 })
  pouzdanost!: number | null;

  @ApiProperty({ description: 'Staff-facing rationale in Serbian. Never shown to the reporter.', type: String, nullable: true, example: 'Fotografija pokazuje otpad oko kontejnera udaljenog 18 m; kontejner je na 91%.' })
  obrazlozenje!: string | null;

  @ApiProperty({
    description: 'The context the proposal was grounded in.', type: ClassificationSignalsDto,
    example: {
      najblizi_kontejner_id: 'cccccccc-0001-4000-8000-000000000001', najblizi_kontejner_m: 18,
      najblizi_kontejner_punjenje: 91, broj_kandidata_kontejnera: 2, pokrivenost: 'da',
      crna_tacka_m: null, kanonska_deponija_m: null, broj_fotografija: 1, kandidata_za_duplikat: 0,
    },
  })
  signali!: ClassificationSignalsDto;

  @ApiProperty({ description: 'Whether the dispatcher agreed, recorded at triage.', type: String, enum: ['prihvacena', 'izmenjena', 'odbacena', null], nullable: true, example: null })
  ishod!: AppIshodKlasifikacije | null;

  @ApiProperty({ description: 'Last failure, kept even when the fallback then succeeded.', type: String, nullable: true, example: null })
  greska!: string | null;

  @ApiProperty({ description: 'When the report entered the classification queue.', example: '2026-09-19T12:00:01.000Z', format: 'date-time' })
  kreirana_at!: string;

  @ApiProperty({ description: 'When the proposal was written; null while pending.', type: String, nullable: true, example: '2026-09-19T12:00:04.000Z', format: 'date-time' })
  obradjena_at!: string | null;
}
