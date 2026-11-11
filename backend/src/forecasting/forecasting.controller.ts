import { Controller, Get, Header, NotFoundException, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DispatcherOnly, StaffGuard } from '../auth/auth.guard';
import { ContainerForecastDto, ForecastDto } from './dto/forecast.dto';
import type { Prognoza } from './forecasting.model';
import { ForecastingService } from './forecasting.service';

/**
 * Lives on the `containers` path although it belongs to the forecasting module:
 * the forecast is a property of a container as far as the API is concerned, and
 * `operationId` is what the frontend client is named after. Nest routes this
 * next to the container lookup without conflict — the paths differ in depth.
 *
 * Reading never triggers a recomputation. `izracunata_at` and
 * `ulazni_podaci_do` are in the response so a stale forecast is visible rather
 * than silently served as current; refreshing is the nightly runner's job and
 * route planning's.
 */
@ApiTags('forecasts')
@ApiUnauthorizedResponse({ description: 'Staff login required.' })
@ApiForbiddenResponse({ description: 'Dispatcher or admin role required.' })
@ApiBearerAuth()
// Same guard as the rest of `/containers`: a forecast is fleet state, and the
// path it hangs off is not open either.
@UseGuards(StaffGuard)
@DispatcherOnly()
@Controller('containers')
export class ForecastingController {
  constructor(private readonly forecasting: ForecastingService) {}

  @Get(':id/forecast')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'getContainerForecast',
    summary: 'Read the fill forecast for one container',
    description:
      'The newest stored forecast: the curve with its p10/p90 band and the expected time of reaching 95 %. ' +
      'Returns `prognoza: null` for a container that has one but no forecast — no sensor, or too little history.',
  })
  @ApiOkResponse({ description: 'The container and its newest forecast, which may be null.', type: ContainerForecastDto })
  @ApiNotFoundResponse({ description: 'No container with that id.' })
  async forecast(@Param('id', ParseUUIDPipe) id: string): Promise<ContainerForecastDto> {
    const prognoza = await this.forecasting.poslednja(id);

    // A missing forecast and a missing container are different answers, and the
    // second one is only worth a query when the first turned up nothing.
    if (prognoza === null && !(await this.forecasting.kontejnerPostoji(id))) {
      throw new NotFoundException('No container with that id');
    }

    return { kontejner_id: id, prognoza: prognoza === null ? null : toDto(prognoza) };
  }
}

function toDto(p: Prognoza): ForecastDto {
  return {
    izracunata_at: p.izracunata_at.toISOString(),
    horizont_do: p.horizont_do.toISOString(),
    ulazni_podaci_do: p.ulazni_podaci_do.toISOString(),
    serija: p.serija,
    vreme_kriticnog: p.vreme_kriticnog === null ? null : p.vreme_kriticnog.toISOString(),
    ima_rupu: p.ima_rupu,
    model_verzija: p.model_verzija,
    pouzdanost: p.pouzdanost,
  };
}
