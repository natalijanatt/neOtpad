import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';

export const STATUSI_PLANA = ['predlog', 'odobren', 'u_toku', 'zavrsen', 'odbijen'] as const;

export class ListRoutePlansQueryDto {
  @ApiPropertyOptional({ description: 'Day to list plans for, YYYY-MM-DD. Defaults to today.', example: '2026-09-19' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  datum?: string;

  @ApiPropertyOptional({ description: 'Only plans in this status.', enum: STATUSI_PLANA, example: 'predlog' })
  @IsOptional()
  @IsIn(STATUSI_PLANA)
  status?: (typeof STATUSI_PLANA)[number];
}
