import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DatabaseHealth } from '../database/database.health';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseHealth) {}

  @Get()
  @ApiOperation({
    operationId: 'getHealth',
    summary: 'Liveness probe',
    description: 'Returns service status, version, uptime and database reachability.',
  })
  @ApiOkResponse({
    description: 'The service is reachable and reports its status.',
    type: HealthResponseDto,
  })
  async getHealth(): Promise<HealthResponseDto> {
    const database = await this.database.check();

    return {
      // 200 with 'degraded' rather than a thrown 503: a probe that cannot be
      // read tells an operator nothing about what is actually broken.
      status: database.reachable ? 'ok' : 'degraded',
      version: process.env.npm_package_version ?? '0.1.0',
      uptimeSeconds: Math.floor(process.uptime()),
      database,
    };
  }
}
