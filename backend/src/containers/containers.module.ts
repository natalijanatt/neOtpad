import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContainersController } from './containers.controller';
import { ContainersRepository } from './containers.repository';
import { ContainersService } from './containers.service';

/**
 * Collection points, containers and their current state. Reads the forecast by
 * joining `prognoza_punjenja` rather than importing the forecasting module,
 * which sits downstream of this one in the module map.
 */
@Module({
  imports: [AuthModule],
  controllers: [ContainersController],
  providers: [ContainersRepository, ContainersService],
  exports: [ContainersService],
})
export class ContainersModule {}
