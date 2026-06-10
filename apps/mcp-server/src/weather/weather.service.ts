import { Injectable } from '@nestjs/common';
import { MOCK_DATE } from '../tools/mock-date.js';

export type WeatherInput = {
  region: string;
  date?: string;
};

@Injectable()
export class WeatherService {
  async getWeatherByRegion(input: WeatherInput) {
    if (!process.env.WEATHER_API_KEY) {
      return this.mockWeather(input);
    }

    return {
      summary: `${input.region} 날씨 API 연동은 API 키 설정 후 활성화됩니다.`,
      raw: {
        temperature: 24,
        rainProbability: 20
      },
      source: 'weather-api-placeholder'
    };
  }

  private mockWeather(input: WeatherInput) {
    const date = input.date ?? MOCK_DATE;
    return {
      summary: `${input.region}의 ${date} 예보는 맑고 선선합니다. 야외 모임을 진행하기 좋습니다.`,
      raw: {
        temperature: 24,
        rainProbability: 20
      },
      source: 'mock'
    };
  }
}
