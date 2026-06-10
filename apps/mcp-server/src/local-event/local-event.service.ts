import { Injectable } from '@nestjs/common';
import { MOCK_DATE } from '../tools/mock-date.js';

export type LocalEventInput = {
  region: string;
  date?: string;
};

@Injectable()
export class LocalEventService {
  async getLocalEventInfo(input: LocalEventInput) {
    const apiKey = process.env.PUBLIC_DATA_API_KEY;
    if (apiKey) {
      try {
        const date = toCompactDate(input.date ?? MOCK_DATE);
        const response = await fetch(
          buildPublicDataUrl('https://apis.data.go.kr/B551011/KorService2/searchFestival2', apiKey, {
            MobileOS: 'ETC',
            MobileApp: 'LocalMindBoard',
            _type: 'json',
            pageNo: '1',
            numOfRows: '10',
            arrange: 'A',
            areaCode: '31',
            eventStartDate: date
          })
        );
        if (!response.ok) {
          throw new Error(`TourAPI request failed: ${response.status} ${await response.text()}`);
        }
        const data = (await response.json()) as TourApiResponse;
        const events = parseTourApiEvents(data, input.region);
        return {
          summary: `${input.region}의 ${formatCompactDate(date)} 지역 행사 정보입니다.`,
          events,
          source: 'tour-api'
        };
      } catch (error) {
        return {
          ...this.mockEvents(input),
          error: errorMessage(error)
        };
      }
    }

    return this.mockEvents(input);
  }

  private mockEvents(input: LocalEventInput) {
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
      source: 'mock'
    };
  }
}

type TourApiEvent = {
  title?: string;
  eventstartdate?: string;
  eventenddate?: string;
  addr1?: string;
};

type TourApiResponse = {
  response?: {
    body?: {
      items?: {
        item?: TourApiEvent[] | TourApiEvent;
      };
    };
  };
};

function parseTourApiEvents(data: TourApiResponse, region: string) {
  const rawItems = data.response?.body?.items?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const regionItems = items.filter((item) => [item.title, item.addr1].filter(Boolean).join(' ').includes(region));
  const selected = regionItems.length > 0 ? regionItems : items;
  return selected.map((item) => ({
    title: item.title ?? '지역 행사',
    date: formatCompactDate(item.eventstartdate ?? MOCK_DATE.replaceAll('-', '')),
    location: item.addr1 ?? region
  }));
}

function toCompactDate(date: string) {
  return date.replaceAll('-', '');
}

function formatCompactDate(date: string) {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function buildPublicDataUrl(endpoint: string, serviceKey: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  const key = serviceKey.includes('%') ? serviceKey : encodeURIComponent(serviceKey);
  return `${endpoint}?serviceKey=${key}&${query.toString()}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
