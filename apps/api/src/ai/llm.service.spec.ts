import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LlmService } from './llm.service.js';

describe('LlmService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: 'test-openai-key',
      OPENAI_BASE_URL: 'https://api.openai.test/v1',
      OPENAI_WEB_SEARCH_MODEL: 'gpt-web-test'
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = originalEnv;
  });

  it('searchWeb uses the Responses API web_search tool and returns citations', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: 'web_search_call',
            id: 'ws_1',
            status: 'completed'
          },
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: '{"openingHours":"매일 09:00-22:00"}',
                annotations: [
                  {
                    type: 'url_citation',
                    url: 'https://place.example/osan-market',
                    title: '오산 마트 영업시간'
                  }
                ]
              }
            ]
          }
        ]
      })
    } as Response);
    const service = new LlmService();

    const result = await service.searchWeb('오산 마트 영업시간');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.test/v1/responses',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"type":"web_search"')
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as Record<string, unknown>;
    expect(body).toEqual(
      expect.objectContaining({
        model: 'gpt-web-test',
        input: '오산 마트 영업시간'
      })
    );
    expect(result).toEqual({
      text: '{"openingHours":"매일 09:00-22:00"}',
      citations: [
        {
          url: 'https://place.example/osan-market',
          title: '오산 마트 영업시간'
        }
      ]
    });
  });
});
