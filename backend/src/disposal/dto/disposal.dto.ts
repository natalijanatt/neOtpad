import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type { AppGeoPreciznost, AppMaterijalOtpada, AppTipMestaOdlaganja } from '../../database/generated/schema';
import { PointDto } from '../../reports/dto/reports.dto';
import { MATERIJALI } from '../materijal';
import type { ClassifierSource } from '../classifier/waste-classifier.port';

const Trim = () => Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value);

export class DisposalQueryDto {
  @ApiProperty({
    description: 'What the citizen wants to get rid of, as typed: any script, dialect or spelling. Capped because every character is sent to a paid model.',
    example: 'imam star šporet i ormar od iverice',
    minLength: 2,
    maxLength: 200,
  })
  @Trim() @IsString() @MinLength(2) @MaxLength(200)
  upit!: string;
}

export class CollectorDto {
  @ApiProperty({ description: 'Collector identifier.', example: '5eed4000-0001-4000-8000-000000000001', format: 'uuid' })
  id!: string;
  @ApiProperty({ description: 'First name.', example: 'Dragan' })
  ime!: string;
  @ApiProperty({ description: 'Last name.', example: 'Stojanović' })
  prezime!: string;
  @ApiProperty({ description: 'Phone in E.164. Public by design: showing it to citizens is the purpose of the listing.', example: '+381637214583' })
  telefon!: string;
  @ApiProperty({ description: 'Materials the collector accepts.', enum: MATERIJALI, enumName: 'MaterijalOtpada', isArray: true, example: ['metal', 'elektronski'] })
  materijali!: AppMaterijalOtpada[];
}

export class CreateCollectorDto {
  @ApiProperty({ description: 'First name.', example: 'Dragan', minLength: 1, maxLength: 80 })
  @Trim() @IsString() @MinLength(1) @MaxLength(80)
  ime!: string;

  @ApiProperty({ description: 'Last name.', example: 'Stojanović', minLength: 1, maxLength: 80 })
  @Trim() @IsString() @MinLength(1) @MaxLength(80)
  prezime!: string;

  @ApiProperty({ description: 'Serbian phone number in any usual spelling ("064 123 4567", "+381 64...", "010 123 456"); stored normalised to E.164.', example: '064 123 4567', minLength: 6, maxLength: 24 })
  @Trim() @IsString() @MinLength(6) @MaxLength(24)
  telefon!: string;

  @ApiProperty({ description: 'Materials the collector accepts; at least one.', enum: MATERIJALI, enumName: 'MaterijalOtpada', isArray: true, example: ['metal', 'gume'] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MATERIJALI.length) @ArrayUnique() @IsIn(MATERIJALI, { each: true })
  materijali!: AppMaterijalOtpada[];
}

export class DefaultContactDto {
  @ApiProperty({ description: 'Organisation name.', example: 'JKP „Regionalna deponija Pirot“' })
  naziv!: string;
  @ApiProperty({ description: 'Phone in E.164.', example: '+38110322540' })
  telefon!: string;
  @ApiProperty({ description: 'Email address.', example: 'kontakt@example.com' })
  email!: string;
  @ApiProperty({ description: 'Website.', example: 'https://jkpdeponijapirot.rs' })
  sajt!: string;
}

export class DisposalSuggestionDto {
  @ApiProperty({ description: 'The query as received, trimmed.', example: 'imam star šporet i ormar od iverice' })
  upit!: string;

  @ApiProperty({
    description: 'Recognised material, in the vocabulary sites and collectors use for what they take. Null when the text is not about disposal or is too unclear.',
    type: String,
    enum: [...MATERIJALI, null],
    nullable: true,
    example: 'iverica',
  })
  materijal!: AppMaterijalOtpada | null;

  @ApiProperty({
    description: 'Which classifier answered: the OpenAI model, or the keyword table it falls back to when unconfigured, slow or failing. Diagnostic — lets a tester see which path ran.',
    enum: ['openai', 'kljucne_reci'],
    example: 'openai',
  })
  izvor!: ClassifierSource;

  @ApiProperty({ description: 'Collectors who accept the recognised material; empty when none do or nothing was recognised.', type: [CollectorDto] })
  sakupljaci!: CollectorDto[];

  @ApiProperty({
    description: 'Always present: the regional landfill operator, for anything the list does not cover.',
    type: DefaultContactDto,
    example: { naziv: 'JKP „Regionalna deponija Pirot“', telefon: '+38110322540', email: 'kontakt@example.com', sajt: 'https://jkpdeponijapirot.rs' },
  })
  kontakt!: DefaultContactDto;
}

export const SITE_TYPES: AppTipMestaOdlaganja[] = ['deponija', 'otkup_sirovina', 'reciklazno_dvoriste'];

export class DisposalSiteDto {
  @ApiProperty({ description: 'Site identifier.', example: 'f0000000-0001-4000-8000-000000000001', format: 'uuid' })
  id!: string;
  @ApiProperty({ description: 'Name as the site is known.', example: 'Otkup i prodaja sekundarnih sirovina KROLUKS' })
  naziv!: string;
  @ApiProperty({ description: 'What the site is (icon and map filter). Not what it takes — see materijali.', enum: SITE_TYPES, example: 'otkup_sirovina' })
  tip!: AppTipMestaOdlaganja;
  @ApiProperty({ description: 'Address or location description; says "približno" when the point is approximate.', example: 'Vojvode Mišića, Pirot' })
  adresa!: string;
  @ApiProperty({ description: 'Map point (WGS84).', type: PointDto, example: { lat: 43.1613779, lon: 22.5837901 } })
  tacka!: PointDto;
  @ApiProperty({ description: 'How exact the point is: a geocoded street is not a surveyed gate.', enum: ['registarska_tacka', 'centroid_naselja', 'geokodirano', 'nepoznato'], example: 'geokodirano' })
  geo_preciznost!: AppGeoPreciznost;
  @ApiProperty({ description: 'Opening hours, when known.', type: String, nullable: true, example: null })
  radno_vreme!: string | null;
  @ApiProperty({ description: 'What the site takes, in its own words.', type: [String], example: ['bakar', 'gvožđe', 'otkup akumulatora'] })
  prima!: string[];
  @ApiProperty({ description: 'What the site takes, in the shared vocabulary; the disposal search matches on this. May be empty.', enum: MATERIJALI, enumName: 'MaterijalOtpada', isArray: true, example: ['metal', 'baterije'] })
  materijali!: AppMaterijalOtpada[];
  @ApiProperty({ description: 'Where this site came from. Every site on the map has one.', example: 'PTT imenik Srbije (preuzeto 2026-09-19)' })
  izvor!: string;
}
