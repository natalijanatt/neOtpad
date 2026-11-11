import { Module } from '@nestjs/common';
import { ForecastingModule } from '../forecasting/forecasting.module';
import { DISTANCE_PROVIDER, HaversineRoadDistance } from './optimizer/distance.port';
import { GreedyRiskAwarePlanner } from './optimizer/greedy-risk-aware.planner';
import { ROUTE_OPTIMIZER } from './optimizer/route-optimizer.port';
import { RoutingController } from './routing.controller';
import { RoutingRepository } from './routing.repository';
import { RoutingService } from './routing.service';

/**
 * Daily route generation. The two ports are the phase-3 seams: OSRM replaces
 * `HaversineRoadDistance`, OR-Tools replaces `GreedyRiskAwarePlanner`, and the
 * service, repository and contract stay as they are.
 */
@Module({
  // Forecasts are an input to scoring, so routing refreshes stale ones before
  // planning. The arrow only points this way: forecasting never imports routing.
  imports: [ForecastingModule],
  controllers: [RoutingController],
  providers: [
    RoutingRepository,
    RoutingService,
    { provide: DISTANCE_PROVIDER, useClass: HaversineRoadDistance },
    { provide: ROUTE_OPTIMIZER, useClass: GreedyRiskAwarePlanner },
  ],
  exports: [RoutingService],
})
export class RoutingModule {}
