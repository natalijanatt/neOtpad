import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Reachability of the Postgres behind the API. Locally that is the Supabase
 * stack; in the cloud it is the project's database. Either way it is the only
 * dependency this service cannot run without, so it is the only one health
 * reports on.
 */
export class DatabaseHealthDto {
  @ApiProperty({
    description: 'Whether a trivial query against the database succeeded.',
    example: true,
  })
  reachable!: boolean;

  @ApiPropertyOptional({
    description: 'Round-trip time of that query, in milliseconds. Absent when unreachable.',
    example: 3,
    minimum: 0,
  })
  latencyMs?: number;
}

/**
 * Seed DTO. Every property carries an explicit @ApiProperty with an `example`,
 * because the frontend runs against a Prism mock generated from those examples
 * and `contract:lint` fails the build when one is missing.
 */
export class HealthResponseDto {
  @ApiProperty({
    description: 'Overall service status. Degraded means the database is unreachable.',
    enum: ['ok', 'degraded'],
    example: 'ok',
  })
  status!: 'ok' | 'degraded';

  @ApiProperty({
    description: 'Deployed version of the service, from package.json.',
    example: '0.1.0',
  })
  version!: string;

  @ApiProperty({
    description: 'Seconds the process has been running.',
    example: 128,
    minimum: 0,
  })
  uptimeSeconds!: number;

  /**
   * Optional rather than required: the contract is additive-only while the
   * frontend is being written against the current shape, and a newly required
   * field is exactly what the oasdiff check rejects.
   */
  @ApiPropertyOptional({
    description: 'Database reachability, omitted when the check could not be run.',
    type: DatabaseHealthDto,
    // The Prism mock the frontend develops against serves these examples, so
    // contract:lint fails a property that has none.
    example: { reachable: true, latencyMs: 3 },
  })
  database?: DatabaseHealthDto;
}
