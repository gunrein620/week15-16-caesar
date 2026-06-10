import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolsService } from './tools.service.js';

describe('ToolsService', () => {
  const weather = {
    getWeatherByRegion: vi.fn()
  };
  const publicFacility = {
    searchPublicFacility: vi.fn()
  };
  const localEvent = {
    getLocalEventInfo: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches get_weather_by_region', async () => {
    weather.getWeatherByRegion.mockResolvedValue({ source: 'mock' });
    const service = new ToolsService(weather as never, publicFacility as never, localEvent as never);

    const result = await service.call('get_weather_by_region', {
      region: '오산',
      date: '2026-06-13'
    });

    expect(result).toEqual({ source: 'mock' });
    expect(weather.getWeatherByRegion).toHaveBeenCalledWith({
      region: '오산',
      date: '2026-06-13'
    });
  });

  it('returns unknown tool as not found', async () => {
    const service = new ToolsService(weather as never, publicFacility as never, localEvent as never);

    await expect(service.call('unknown_tool', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects invalid weather params', async () => {
    const service = new ToolsService(weather as never, publicFacility as never, localEvent as never);

    await expect(service.call('get_weather_by_region', { date: '2026-06-13' })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});
