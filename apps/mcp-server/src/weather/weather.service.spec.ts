import { afterEach, describe, expect, it } from 'vitest';
import { WeatherService } from './weather.service.js';

describe('WeatherService', () => {
  const originalKey = process.env.WEATHER_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.WEATHER_API_KEY = originalKey;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('returns deterministic mock weather in development when no API key exists', async () => {
    process.env.NODE_ENV = 'development';
    process.env.WEATHER_API_KEY = '';
    const service = new WeatherService();

    const result = await service.getWeatherByRegion({
      region: '오산',
      date: '2026-06-13'
    });

    expect(result).toEqual({
      summary: '오산의 2026-06-13 예보는 맑고 선선합니다. 야외 모임을 진행하기 좋습니다.',
      raw: {
        temperature: 24,
        rainProbability: 20
      },
      source: 'mock'
    });
  });

  it('uses a fixed mock date when date is omitted', async () => {
    process.env.NODE_ENV = 'development';
    process.env.WEATHER_API_KEY = '';
    const service = new WeatherService();

    const result = await service.getWeatherByRegion({ region: '오산' });

    expect(result.summary).toContain('2026-06-13');
  });
});
