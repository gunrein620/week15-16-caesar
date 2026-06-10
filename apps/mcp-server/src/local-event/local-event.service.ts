import { Injectable } from '@nestjs/common';
import { MOCK_DATE } from '../tools/mock-date.js';

export type LocalEventInput = {
  region: string;
  date?: string;
};

@Injectable()
export class LocalEventService {
  async getLocalEventInfo(input: LocalEventInput) {
    const date = input.date ?? MOCK_DATE;
    return {
      summary: `${input.region}의 ${date} 지역 행사 정보입니다.`,
      events: [
        {
          title: '오산 플리마켓',
          date,
          location: '오산역 광장'
        },
        {
          title: '동네 생활정보 나눔 모임',
          date,
          location: '오산시 중앙도서관'
        }
      ],
      source: process.env.PUBLIC_DATA_API_KEY ? 'public-data-placeholder' : 'mock'
    };
  }
}
