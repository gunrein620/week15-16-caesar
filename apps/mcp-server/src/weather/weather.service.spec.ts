import { afterEach, describe, expect, it, vi } from 'vitest';
import { WeatherService } from './weather.service.js';

describe('WeatherService', () => {
  const originalKey = process.env.WEATHER_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.WEATHER_API_KEY = originalKey;
    process.env.NODE_ENV = originalNodeEnv;
    vi.unstubAllGlobals();
    vi.useRealTimers();
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

  it('calls the KMA forecast API and summarizes forecast values when an API key exists', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T06:30:00.000Z'));
    process.env.WEATHER_API_KEY = 'weather-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          body: {
            items: {
              item: [
                { fcstDate: '20260610', fcstTime: '1500', category: 'TMP', fcstValue: '25' },
                { fcstDate: '20260610', fcstTime: '1500', category: 'POP', fcstValue: '30' },
                { fcstDate: '20260610', fcstTime: '1500', category: 'SKY', fcstValue: '1' },
                { fcstDate: '20260610', fcstTime: '1500', category: 'PTY', fcstValue: '0' }
              ]
            }
          }
        }
      })
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = new WeatherService();

    const result = await service.getWeatherByRegion({
      region: '오산',
      date: '2026-06-10'
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst'
    );
    expect(result.source).toBe('kma-vilage-fcst');
    expect(result.summary).toContain('오산의 2026-06-10 예보');
    expect(result.raw).toMatchObject({
      temperature: 25,
      rainProbability: 30,
      sky: '맑음',
      precipitation: '없음'
    });
  });

  it('falls back to mock weather when the KMA request fails', async () => {
    process.env.WEATHER_API_KEY = 'weather-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'fail' }));
    const service = new WeatherService();

    const result = await service.getWeatherByRegion({
      region: '오산',
      date: '2026-06-13'
    });

    expect(result.source).toBe('mock');
    expect(result.raw).toMatchObject({
      error: expect.stringContaining('KMA weather request failed')
    });
  });
});
