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
        const date = input.date ?? MOCK_DATE;
        const keyword = culturalEventKeyword(input.region);
        const response = await fetch(
          buildPublicDataUrl('https://api.kcisa.kr/API_CNV_050/request', apiKey, {
            pageNo: '1',
            numOfRows: '10',
            keyword
          }),
          {
            headers: {
              Accept: 'application/json'
            }
          }
        );
        if (!response.ok) {
          throw new Error(`KCISA cultural event request failed: ${response.status} ${await response.text()}`);
        }
        const data = (await response.json()) as KcisaEventResponse;
        const events = parseKcisaEvents(data, input.region, date);
        if (events.length === 0) {
          throw new Error(`KCISA cultural event API returned no events matching ${input.region}.`);
        }
        return {
          summary: `${input.region}의 ${date} 지역 문화행사 정보입니다.`,
          events,
          source: 'kcisa-cultural-event'
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

type KcisaEvent = {
  title?: string;
  description?: string | null;
  subDescription?: string | null;
  url?: string | null;
  localId?: string | null;
  sourceTitle?: string | null;
  charge?: string | null;
  type?: string | null;
  period?: string | null;
};

type KcisaEventResponse = {
  response?: {
    header?: {
      resultCode?: string;
      resultMsg?: string;
    };
    body?: {
      items?: {
        item?: KcisaEvent[] | KcisaEvent;
      };
    };
  };
};

function parseKcisaEvents(data: KcisaEventResponse, region: string, requestedDate: string) {
  const resultCode = data.response?.header?.resultCode;
  if (resultCode && resultCode !== '0000') {
    throw new Error(`KCISA cultural event API returned ${resultCode}: ${data.response?.header?.resultMsg ?? ''}`);
  }

  const rawItems = data.response?.body?.items?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const regionItems = items.filter((item) => isRegionEvent(item, region));
  const dateMatched = regionItems.filter((item) => isDateInPeriod(requestedDate, item.period));
  const selected = dateMatched.length > 0 ? dateMatched : regionItems;

  return selected.map((item) => ({
    title: item.title ?? '지역 행사',
    date: firstDateInPeriod(item.period) ?? requestedDate,
    period: item.period ?? requestedDate,
    location: item.sourceTitle ?? region,
    description: stripHtml(item.description ?? item.subDescription ?? ''),
    url: item.url ?? undefined,
    sourceTitle: item.sourceTitle ?? undefined,
    charge: item.charge ?? undefined,
    type: item.type ?? undefined
  }));
}

function culturalEventKeyword(region: string) {
  if (region.includes('오산')) {
    return '오산문화';
  }
  return region;
}

function isRegionEvent(item: KcisaEvent, region: string) {
  const text = [item.title, item.description, item.subDescription, item.sourceTitle]
    .filter(Boolean)
    .join(' ');
  if (region.includes('오산')) {
    return /오산(시|문화|역|시민|예술|재단)?/.test(text) && !text.includes('카오산');
  }
  return text.includes(region);
}

function isDateInPeriod(date: string, period?: string | null) {
  const range = parsePeriod(period);
  if (!range) {
    return false;
  }
  return range.start <= date && date <= range.end;
}

function firstDateInPeriod(period?: string | null) {
  return parsePeriod(period)?.start;
}

function parsePeriod(period?: string | null) {
  if (!period) {
    return null;
  }
  const matches = [...period.matchAll(/\d{4}[-.]?\d{2}[-.]?\d{2}/g)].map((match) =>
    normalizeDate(match[0])
  );
  if (matches.length === 0) {
    return null;
  }
  return {
    start: matches[0],
    end: matches[1] ?? matches[0]
  };
}

function normalizeDate(date: string) {
  const compact = date.replaceAll('-', '').replaceAll('.', '');
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function stripHtml(value: string) {
  const cleaned = value
    .replace(/<img\b[^>]*(?:>|$)/gis, ' ')
    .replace(/data:image\/[^"' <]+/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;[^&]*&gt;/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 240 ? `${cleaned.slice(0, 240)}...` : cleaned;
}

function buildPublicDataUrl(endpoint: string, serviceKey: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  query.set('serviceKey', serviceKey);
  return `${endpoint}?${query.toString()}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
