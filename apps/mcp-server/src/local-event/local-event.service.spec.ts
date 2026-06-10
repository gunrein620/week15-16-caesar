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

  it('calls the KCISA cultural event endpoint and maps events when a public data key exists', async () => {
    process.env.PUBLIC_DATA_API_KEY = 'public-data-key';
    const fetchMock = vi.fn().mockResolvedValue({
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
                  title: '오산 플리마켓',
                  description: '<p>오산 시민을 위한 문화 행사입니다.</p><img src="data:image/png;base64,AAAA',
                  url: 'https://example.com/event',
                  sourceTitle: '오산문화재단',
                  charge: '무료',
                  type: '문화행사',
                  period: '2026-06-13 ~ 2026-06-13'
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
      'https://api.kcisa.kr/API_CNV_050/request'
    );
    expect(String(fetchMock.mock.calls[0][0])).toContain('keyword=%EC%98%A4%EC%82%B0%EB%AC%B8%ED%99%94');
    expect(result.source).toBe('kcisa-cultural-event');
    expect(result.events[0]).toMatchObject({
      title: '오산 플리마켓',
      date: '2026-06-13',
      period: '2026-06-13 ~ 2026-06-13',
      description: '오산 시민을 위한 문화 행사입니다.',
      url: 'https://example.com/event',
      sourceTitle: '오산문화재단'
    });
    expect(result.events[0]).not.toMatchObject({
      description: expect.stringContaining('data:image')
    });
  });

  it('falls back to mock events when the KCISA API fails', async () => {
    process.env.PUBLIC_DATA_API_KEY = 'public-data-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('culture api down')));
    const service = new LocalEventService();

    const result = await service.getLocalEventInfo({
      region: '오산',
      date: '2026-06-13'
    });

    expect(result.source).toBe('mock');
    expect(result).toMatchObject({
      error: expect.stringContaining('culture api down')
    });
  });

  it('falls back to mock events when the KCISA API has no events matching the requested region', async () => {
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
                    description: '서울 행사',
                    period: '2026-06-13 ~ 2026-06-13'
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
      error: expect.stringContaining('KCISA cultural event API returned no events matching 오산')
    });
  });
});
