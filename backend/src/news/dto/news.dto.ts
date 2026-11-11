import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsString, IsUUID, IsUrl, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import type { AppKategorijaVesti } from '../../database/generated/schema';

export const NEWS_CATEGORIES: AppKategorijaVesti[] = ['obavestenje', 'akcija', 'raspored', 'edukacija'];

const Trim = () => Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value);
const Optional = () => ValidateIf((_object: unknown, value: unknown) => value !== undefined);
/**
 * Clearing a field is an edit, not an omission: `slika_url: null` removes the
 * image, while leaving the key out keeps it. Both have to reach the service, so
 * null skips validation and is handled there.
 */
const Nullable = () => ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null);

export class CreateNewsDto {
  @ApiProperty({ description: 'Headline as citizens see it.', example: 'Izmena rasporeda odvoza za Temsku', minLength: 3, maxLength: 200 })
  @Trim() @IsString() @MinLength(3) @MaxLength(200)
  naslov!: string;

  @ApiProperty({ description: 'Post body. Blank lines separate paragraphs; the feed keeps line breaks.', example: 'Od ponedeljka kamion dolazi sredom umesto cetvrtkom, 07:00-10:00.', minLength: 3, maxLength: 5000 })
  @Trim() @IsString() @MinLength(3) @MaxLength(5000)
  sadrzaj!: string;

  @ApiPropertyOptional({ description: 'Image URL. There is no upload endpoint yet, so this is a link to an already hosted image.', example: 'https://cdn.pirot.rs/vesti/akcija-sukovo.jpg', type: String, nullable: true, maxLength: 2000 })
  @Nullable() @Trim() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2000)
  slika_url?: string | null;

  @ApiPropertyOptional({ description: 'Post category, used for the badge and icon in the feed. Defaults to obavestenje.', enum: NEWS_CATEGORIES, example: 'raspored' })
  @Optional() @IsIn(NEWS_CATEGORIES)
  kategorija?: AppKategorijaVesti;

  @ApiPropertyOptional({ description: 'Settlement the post is about. Null (the default) means the whole municipality; a settlement post stays readable by everyone.', example: 'aaaaaaaa-0002-4000-8000-000000000002', type: String, nullable: true, format: 'uuid' })
  @Nullable() @IsUUID()
  naselje_id?: string | null;

  @ApiPropertyOptional({ description: 'Pin the post above newer ones. A schedule change has to outlive a week of other news. Defaults to false.', example: false })
  @Optional() @IsBoolean()
  zakacena?: boolean;

  @ApiPropertyOptional({ description: 'The same news for citizens without a smartphone, sent by SMS/Viber and to local-community presidents. One message only: 160 characters in plain ASCII, but 70 if it contains c/c/s/z/d, because those force UCS-2 encoding. Null means the post deliberately stays in the app.', example: 'Od 22.9. odvoz u Temskoj je SREDOM 07-10h umesto cetvrtkom. JKP Komunalac Pirot.', type: String, nullable: true, minLength: 3, maxLength: 160 })
  @Nullable() @Trim() @IsString() @MinLength(3) @MaxLength(160)
  sms_tekst?: string | null;

  @ApiPropertyOptional({ description: 'Signature shown on the post: a service, not the person who typed it. Defaults to the utility.', example: 'JKP Komunalac Pirot', minLength: 2, maxLength: 120 })
  @Optional() @Trim() @IsString() @MinLength(2) @MaxLength(120)
  autor?: string;
}

export class UpdateNewsDto extends PartialType(CreateNewsDto) {
  @ApiProperty({ description: 'Expected current post version; a stale value means someone else edited the post first.', example: 1, minimum: 1 })
  @IsInt() @Min(1)
  verzija!: number;
}

export class NewsQueryDto {
  @ApiPropertyOptional({ description: 'Result page, starting at 1.', example: 1, default: 1, minimum: 1, maximum: 100000 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100000)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Maximum items per page.', example: 25, default: 25, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 25;

  @ApiPropertyOptional({ description: 'Settlement feed: returns posts for this settlement PLUS municipality-wide ones, because a village feed without the municipal news is missing half of it.', example: 'aaaaaaaa-0002-4000-8000-000000000002', format: 'uuid' })
  @Optional() @IsUUID()
  naselje_id?: string;

  @ApiPropertyOptional({ description: 'Category filter.', enum: NEWS_CATEGORIES, example: 'akcija' })
  @Optional() @IsIn(NEWS_CATEGORIES)
  kategorija?: AppKategorijaVesti;
}

export class NewsResponseDto {
  @ApiProperty({ description: 'Post identifier.', example: '66666666-6666-4666-8666-666666666666', format: 'uuid' })
  id!: string;
  @ApiProperty({ description: 'Headline.', example: 'Izmena rasporeda odvoza za Temsku' })
  naslov!: string;
  @ApiProperty({ description: 'Post body with line breaks preserved.', example: 'Od ponedeljka kamion dolazi sredom umesto cetvrtkom, 07:00-10:00.' })
  sadrzaj!: string;
  @ApiProperty({ description: 'Image URL, if the post has one.', type: String, nullable: true, example: null })
  slika_url!: string | null;
  @ApiProperty({ description: 'Post category.', enum: NEWS_CATEGORIES, example: 'raspored' })
  kategorija!: AppKategorijaVesti;
  @ApiProperty({ description: 'Settlement the post is about; null means the whole municipality.', type: String, nullable: true, example: 'aaaaaaaa-0002-4000-8000-000000000002' })
  naselje_id!: string | null;
  @ApiProperty({ description: 'Whether the post is pinned above newer ones.', example: true })
  zakacena!: boolean;
  @ApiProperty({ description: 'SMS/Viber copy of the post; null means it was published in the app only.', type: String, nullable: true, example: 'Od 22.9. odvoz u Temskoj je SREDOM 07-10h. JKP Komunalac Pirot.' })
  sms_tekst!: string | null;
  @ApiProperty({ description: 'Signature shown on the post.', example: 'JKP Komunalac Pirot' })
  autor!: string;
  @ApiProperty({ description: 'Publication instant; editing does not move it.', example: '2026-09-19T08:00:00.000Z', format: 'date-time' })
  objavljena_at!: string;
  @ApiProperty({ description: 'Last edit instant; null when the post has never been edited.', type: String, nullable: true, example: null, format: 'date-time' })
  azurirana_at!: string | null;
  @ApiProperty({ description: 'Current version, required to edit the post.', example: 1 })
  verzija!: number;
}

export class NewsPageDto {
  @ApiProperty({ description: 'Posts in feed order: pinned first, then newest, with a stable identifier tie-breaker.', type: [NewsResponseDto] })
  items!: NewsResponseDto[];
  @ApiProperty({ description: 'Current page.', example: 1 })
  page!: number;
  @ApiProperty({ description: 'Requested maximum page size.', example: 25 })
  limit!: number;
  @ApiProperty({ description: 'Whether another page exists.', example: false })
  hasMore!: boolean;
}
