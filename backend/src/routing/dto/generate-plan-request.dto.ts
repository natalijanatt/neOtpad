import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, Matches, ValidateNested } from 'class-validator';
import { ObjectiveWeightsOverrideDto, RoutingParametersOverrideDto } from './objective.dto';

export class GeneratePlanRequestDto {
  @ApiProperty({ description: 'The day to plan, YYYY-MM-DD.', example: '2026-09-19', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  datum!: string;

  @ApiPropertyOptional({
    description: 'Overrides for the priority weights; omitted keys keep their defaults.',
    type: ObjectiveWeightsOverrideDto,
    example: { prelivanje: 0.4, prag_obaveznog: 0.5 },
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ObjectiveWeightsOverrideDto)
  tezine?: ObjectiveWeightsOverrideDto;

  @ApiPropertyOptional({
    description: 'Overrides for the cost model; omitted keys keep their defaults.',
    type: RoutingParametersOverrideDto,
    example: { radno_vreme_min: 420, pocetak_smene: '07:00' },
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RoutingParametersOverrideDto)
  parametri?: RoutingParametersOverrideDto;
}
