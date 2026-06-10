import { Module } from '@nestjs/common';
import { LocalEventService } from '../local-event/local-event.service.js';
import { PublicFacilityService } from '../public-facility/public-facility.service.js';
import { WeatherService } from '../weather/weather.service.js';
import { ToolsService } from './tools.service.js';

@Module({
  providers: [ToolsService, WeatherService, PublicFacilityService, LocalEventService],
  exports: [ToolsService]
})
export class ToolsModule {}
