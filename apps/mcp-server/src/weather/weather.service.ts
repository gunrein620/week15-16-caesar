import { Injectable } from '@nestjs/common';
import { MOCK_DATE } from '../tools/mock-date.js';

export type WeatherInput = {
  region: string;
  date?: string;
};

@Injectable()
export class WeatherService {
  async getWeatherByRegion(input: WeatherInput) {
    const apiKey = process.env.WEATHER_API_KEY;
    if (!apiKey) {
      return this.mockWeather(input);
    }

    try {
      const targetDate = toCompactDate(input.date ?? kstDateString());
      const { baseDate, baseTime } = latestKmaBase();
      const response = await fetch(
        buildPublicDataUrl(
          'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst',
          apiKey,
          {
            pageNo: '1',
            numOfRows: '1000',
            dataType: 'JSON',
            base_date: baseDate,
            base_time: baseTime,
            nx: '62',
            ny: '119'
          }
        )
      );
      if (!response.ok) {
        throw new Error(`KMA weather request failed: ${response.status} ${await response.text()}`);
      }
      const data = (await response.json()) as KmaForecastResponse;
      const forecast = parseKmaForecast(data, targetDate);
      return {
        summary: `${input.region}의 ${formatCompactDate(targetDate)} 예보는 ${forecast.sky}이고 강수확률은 ${forecast.rainProbability}%입니다.`,
        raw: forecast,
        source: 'kma-vilage-fcst'
      };
    } catch (error) {
      return this.mockWeather(input, errorMessage(error));
    }
  }

  private mockWeather(input: WeatherInput, error?: string) {
    const date = input.date ?? MOCK_DATE;
    return {
      summary: `${input.region}의 ${date} 예보는 맑고 선선합니다. 야외 모임을 진행하기 좋습니다.`,
      raw: {
        temperature: 24,
        rainProbability: 20,
        ...(error ? { error } : {})
      },
      source: 'mock'
    };
  }
}

type KmaForecastItem = {
  fcstDate: string;
  fcstTime: string;
  category: string;
  fcstValue: string;
};

type KmaForecastResponse = {
  response?: {
    body?: {
      items?: {
        item?: KmaForecastItem[] | KmaForecastItem;
      };
    };
  };
};

function parseKmaForecast(data: KmaForecastResponse, targetDate: string) {
  const rawItems = data.response?.body?.items?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const targetItems = items
    .filter((item) => item.fcstDate === targetDate)
    .sort((left, right) => left.fcstTime.localeCompare(right.fcstTime));
  const selectedTime = targetItems.find((item) => ['TMP', 'POP', 'SKY', 'PTY'].includes(item.category))?.fcstTime;
  const selected = targetItems.filter((item) => item.fcstTime === selectedTime);

  if (selected.length === 0) {
    throw new Error('KMA weather response did not include forecast items for the target date.');
  }

  const byCategory = new Map(selected.map((item) => [item.category, item.fcstValue]));
  return {
    temperature: numberValue(byCategory.get('TMP')),
    rainProbability: numberValue(byCategory.get('POP')),
    sky: skyText(byCategory.get('SKY')),
    precipitation: precipitationText(byCategory.get('PTY')),
    forecastDate: formatCompactDate(targetDate),
    forecastTime: selectedTime
  };
}

function numberValue(value?: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function skyText(value?: string) {
  switch (value) {
    case '1':
      return '맑음';
    case '3':
      return '구름많음';
    case '4':
      return '흐림';
    default:
      return '정보 없음';
  }
}

function precipitationText(value?: string) {
  switch (value) {
    case '0':
      return '없음';
    case '1':
      return '비';
    case '2':
      return '비/눈';
    case '3':
      return '눈';
    case '4':
      return '소나기';
    default:
      return '정보 없음';
  }
}

function latestKmaBase() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes() - 20;
  const baseTimes = ['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300'];
  const selected = [...baseTimes].reverse().find((time) => toMinutes(time) <= currentMinutes);
  if (selected) {
    return { baseDate: compactDate(now), baseTime: selected };
  }

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return { baseDate: compactDate(yesterday), baseTime: '2300' };
}

function toMinutes(time: string) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(2, 4));
}

function kstDateString() {
  return formatCompactDate(compactDate(new Date(Date.now() + 9 * 60 * 60 * 1000)));
}

function toCompactDate(date: string) {
  return date.replaceAll('-', '');
}

function compactDate(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function formatCompactDate(date: string) {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function buildPublicDataUrl(endpoint: string, serviceKey: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  const key = serviceKey.includes('%') ? serviceKey : encodeURIComponent(serviceKey);
  return `${endpoint}?ServiceKey=${key}&${query.toString()}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
