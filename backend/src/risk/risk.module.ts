import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RiskController } from './risk.controller';
import { RiskRepository } from './risk.repository';
import { RiskService } from './risk.service';

/**
 * Risk scores and black spots. Reads `deponija_kanonska` and `rizik` by joining
 * them rather than importing `deponije` or a scoring module — the rule the other
 * repositories already follow: repositories join across tables, modules do not
 * import each other.
 */
@Module({
  imports: [AuthModule],
  controllers: [RiskController],
  providers: [RiskRepository, RiskService],
  exports: [RiskService],
})
export class RiskModule {}
