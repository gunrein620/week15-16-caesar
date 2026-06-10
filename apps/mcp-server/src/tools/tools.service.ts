import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { LocalEventService } from '../local-event/local-event.service.js';
import { PublicFacilityService } from '../public-facility/public-facility.service.js';
import { WeatherService } from '../weather/weather.service.js';

@Injectable()
export class ToolsService {
  constructor(
    @Inject(WeatherService) private readonly weatherService: WeatherService,
    @Inject(PublicFacilityService) private readonly publicFacilityService: PublicFacilityService,
    @Inject(LocalEventService) private readonly localEventService: LocalEventService
  ) {}

  async call(name: string, args: Record<string, unknown>) {
    switch (name) {
      case 'get_weather_by_region':
        return this.weatherService.getWeatherByRegion(this.requireRegion(args));
      case 'search_public_facility':
        return this.publicFacilityService.searchPublicFacility({
          region: this.requireRegion(args).region,
          keyword: typeof args.keyword === 'string' ? args.keyword : undefined
        });
      case 'get_local_event_info':
        return this.localEventService.getLocalEventInfo(this.requireRegion(args));
      default:
        throw new NotFoundException(`Unknown MCP tool: ${name}`);
    }
  }

  private requireRegion(args: Record<string, unknown>) {
    if (typeof args.region !== 'string' || !args.region.trim()) {
      throw new BadRequestException('region is required');
    }
    return {
      region: args.region.trim(),
      date: typeof args.date === 'string' && args.date.trim() ? args.date.trim() : undefined
    };
  }
}
