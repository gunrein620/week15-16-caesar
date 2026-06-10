import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalEventService } from './local-event.service.js';

describe('LocalEventService', () => {
  const originalKey = process.env.PUBLIC_DATA_API_KEY;

  afterEach(() => {
    process.env.PUBLIC_DATA_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it('uses a fixed mock date when date is omitted', async () => {
    process.env.PUBLIC_DATA_API_KEY = '';
    const service = new LocalEventService();

    const result = await service.getLocalEventInfo({ region: '오산' });

    expect(result.summary).toContain('2026-06-13');
    expect(result.events[0].date).toBe('2026-06-13');
    expect(result.source).toBe('mock');
  });

  it('calls the TourAPI festival endpoint and maps events when a public data key exists', async () => {
    process.env.PUBLIC_DATA_API_KEY = 'public-data-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          body: {
            items: {
              item: [
                {
                  title: '오산 플리마켓',
                  eventstartdate: '20260613',
                  eventenddate: '20260613',
                  addr1: '경기도 오산시 오산역 광장'
                }
              ]
            }
          }
        }
      })
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = new LocalEventService();

    const result = await service.getLocalEventInfo({
      region: '오산',
      date: '2026-06-13'
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'https://apis.data.go.kr/B551011/KorService2/searchFestival2'
    );
    expect(String(fetchMock.mock.calls[0][0])).toContain('areaCode=31');
    expect(String(fetchMock.mock.calls[0][0])).toContain('sigunguCode=22');
    expect(result.source).toBe('tour-api');
    expect(result.events[0]).toEqual({
      title: '오산 플리마켓',
      date: '2026-06-13',
      location: '경기도 오산시 오산역 광장'
    });
  });

  it('falls back to mock events when TourAPI fails', async () => {
    process.env.PUBLIC_DATA_API_KEY = 'public-data-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('tour api down')));
    const service = new LocalEventService();

    const result = await service.getLocalEventInfo({
      region: '오산',
      date: '2026-06-13'
    });

    expect(result.source).toBe('mock');
    expect(result).toMatchObject({
      error: expect.stringContaining('tour api down')
    });
  });

  it('falls back to mock events when TourAPI has no events matching the requested region', async () => {
    process.env.PUBLIC_DATA_API_KEY = 'public-data-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: {
            header: {
              resultCode: '0000',
              resultMsg: 'OK'
            },
            body: {
              items: {
                item: [
                  {
                    title: '강동선사문화축제',
                    eventstartdate: '20260613',
                    addr1: '서울특별시 강동구 올림픽로 875'
                  }
                ]
              }
            }
          }
        })
      })
    );
    const service = new LocalEventService();

    const result = await service.getLocalEventInfo({
      region: '오산',
      date: '2026-06-13'
    });

    expect(result.source).toBe('mock');
    expect(result).toMatchObject({
      error: expect.stringContaining('TourAPI returned no events matching 오산')
    });
  });
});
