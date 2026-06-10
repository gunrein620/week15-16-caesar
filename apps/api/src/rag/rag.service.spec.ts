import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RagService } from './rag.service.js';

describe('RagService', () => {
  const prisma = {
    region: {
      findUnique: vi.fn()
    },
    post: {
      findMany: vi.fn()
    }
  };
  const embeddingService = {
    createEmbedding: vi.fn()
  };
  const vectorSearchService = {
    search: vi.fn()
  };
  const llmService = {
    chat: vi.fn(),
    searchWeb: vi.fn()
  };
  const mcpClientService = {
    callTool: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.region.findUnique.mockResolvedValue({ id: 'osan-id', code: 'OSAN', name: '오산시' });
    embeddingService.createEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    llmService.searchWeb.mockResolvedValue({ text: '{}', citations: [] });
  });

  it('duplicate-check returns POST candidates over 0.86 using default OSAN region', async () => {
    vectorSearchService.search.mockResolvedValue([
      { sourceType: 'POST', sourceId: 'post-1', content: '오산 야간 약국', similarity: 0.91 },
      { sourceType: 'POST', sourceId: 'post-2', content: '오산 주차장', similarity: 0.72 }
    ]);
    const service = new RagService(
      prisma as never,
      embeddingService as never,
      vectorSearchService as never,
      llmService as never
    );

    const result = await service.checkDuplicate({
      title: '야간 약국 어디 있어요?',
      content: '오산역 근처 야간 약국 찾습니다.'
    });

    expect(prisma.region.findUnique).toHaveBeenCalledWith({ where: { code: 'OSAN' } });
    expect(vectorSearchService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        regionId: 'osan-id',
        sourceTypes: ['POST']
      })
    );
    expect(result.isDuplicate).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].similarity).toBe(0.91);
  });

  it('similar-posts returns candidates over 0.70', async () => {
    vectorSearchService.search.mockResolvedValue([
      { sourceType: 'POST', sourceId: 'post-1', content: '플리마켓 공지', similarity: 0.75 },
      { sourceType: 'POST', sourceId: 'post-2', content: '다른 글', similarity: 0.69 }
    ]);
    const service = new RagService(
      prisma as never,
      embeddingService as never,
      vectorSearchService as never,
      llmService as never
    );

    const result = await service.findSimilarPosts({
      title: '플리마켓 열리나요?',
      content: '이번 주말 오산 행사 궁금합니다.'
    });

    expect(result.candidates).toEqual([
      expect.objectContaining({
        sourceId: 'post-1',
        similarity: 0.75
      })
    ]);
  });

  it('similar-posts falls back to keyword candidates when vector threshold removes all rows', async () => {
    vectorSearchService.search.mockResolvedValue([]);
    prisma.post.findMany.mockResolvedValue([
      {
        id: 'post-1',
        title: '오산 야간 약국 정보 모아봐요',
        content: '오산역과 원동 주변 야간 약국 정보를 댓글로 모아두면 좋겠습니다.',
        regionId: 'osan-id',
        category: { name: '병원/약국' },
        region: { name: '오산시' },
        tags: [{ tag: { name: '야간약국' } }]
      }
    ]);
    const service = new RagService(
      prisma as never,
      embeddingService as never,
      vectorSearchService as never,
      llmService as never
    );

    const result = await service.findSimilarPosts({
      title: '오산 야간 약국 어디인지 공유',
      content: '오산역 근처 밤에 여는 약국을 찾습니다.'
    });

    expect(result.candidates).toEqual([
      expect.objectContaining({
        sourceId: 'post-1',
        content: expect.stringContaining('오산 야간 약국 정보 모아봐요')
      })
    ]);
  });

  it('duplicate-check falls back to keyword candidates when vector threshold removes all rows', async () => {
    vectorSearchService.search.mockResolvedValue([]);
    prisma.post.findMany.mockResolvedValue([
      {
        id: 'post-1',
        title: '오산 야간 약국 정보 모아봐요',
        content: '오산역과 원동 주변 야간 약국 정보를 댓글로 모아두면 좋겠습니다.',
        regionId: 'osan-id',
        category: { name: '병원/약국' },
        region: { name: '오산시' },
        tags: [{ tag: { name: '야간약국' } }]
      }
    ]);
    const service = new RagService(
      prisma as never,
      embeddingService as never,
      vectorSearchService as never,
      llmService as never
    );

    const result = await service.checkDuplicate({
      title: '오산 야간 약국 정보 모아봐요',
      content: '오산역 주변 약국'
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.candidates[0]).toEqual(expect.objectContaining({ sourceId: 'post-1' }));
  });

  it('ask returns an answer with RAG sources', async () => {
    vectorSearchService.search.mockResolvedValue([
      { sourceType: 'POST', sourceId: 'post-1', content: '오산역 근처 야간 약국 정보', similarity: 0.88 }
    ]);
    llmService.chat.mockResolvedValue('오산역 근처 야간 약국 글을 확인해 보세요.');
    const service = new RagService(
      prisma as never,
      embeddingService as never,
      vectorSearchService as never,
      llmService as never
    );

    const result = await service.ask({
      question: '근처 야간 약국 어디 있어?'
    });

    expect(llmService.chat).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user' })
      ]),
      expect.any(Object)
    );
    expect(result).toEqual({
      answer: '오산역 근처 야간 약국 글을 확인해 보세요.',
      sources: [
        expect.objectContaining({
          sourceId: 'post-1',
          url: '/posts/post-1'
        })
      ]
    });
  });

  it('ask uses external place search as primary context for pharmacy questions', async () => {
    vectorSearchService.search.mockResolvedValue([
      { sourceType: 'POST', sourceId: 'post-1', content: '게시판 후기: 오산역 근처 약국은 전화 확인이 필요합니다.', similarity: 0.81 }
    ]);
    mcpClientService.callTool.mockResolvedValue({
      summary: '오산역 장소 검색 결과입니다.',
      facilities: [
        {
          name: '오산역온누리약국',
          category: '약국',
          address: '경기 오산시 오산로 123',
          url: 'https://place.map.kakao.com/123',
          latitude: 37.145,
          longitude: 127.066
        }
      ],
      source: 'kakao-local'
    });
    llmService.chat.mockResolvedValue('오산역온누리약국을 먼저 확인하고, 게시판 후기는 참고하세요.');
    const service = new RagService(
      prisma as never,
      embeddingService as never,
      vectorSearchService as never,
      llmService as never,
      mcpClientService as never
    );

    const result = await service.ask({
      question: '오산역 근처 약국 어디 있어?'
    });

    expect(mcpClientService.callTool).toHaveBeenCalledWith('search_public_facility', {
      region: '오산역',
      keyword: '약국'
    });
    const userMessage = llmService.chat.mock.calls[0][0][1].content;
    expect(userMessage.indexOf('외부 장소 검색 결과')).toBeLessThan(userMessage.indexOf('게시판 보조 근거'));
    expect(userMessage).toContain('오산역온누리약국');
    expect(llmService.searchWeb).not.toHaveBeenCalled();
    expect(result.externalSources).toEqual([
      expect.objectContaining({
        name: '오산역온누리약국',
        source: 'kakao-local'
      })
    ]);
    expect(result.sources).toEqual([expect.objectContaining({ sourceId: 'post-1' })]);
  });

  it('ask enriches place results with operating hours from web search', async () => {
    vectorSearchService.search.mockResolvedValue([
      { sourceType: 'POST', sourceId: 'post-1', content: '게시판 후기: 마트 주말 주차가 혼잡합니다.', similarity: 0.81 }
    ]);
    mcpClientService.callTool.mockResolvedValue({
      summary: '오산 장소 검색 결과입니다.',
      facilities: [
        {
          name: '이마트 오산점',
          category: '대형마트',
          address: '경기 오산시 경기대로 181',
          url: 'https://place.map.kakao.com/8041485'
        },
        {
          name: '홈플러스 오산점',
          category: '대형마트',
          address: '경기 오산시 청학로 238',
          url: 'https://place.map.kakao.com/21312240'
        }
      ],
      source: 'kakao-local'
    });
    llmService.searchWeb.mockResolvedValueOnce({
      text: JSON.stringify({
        openingHours: '매일 10:00-22:00',
        sourceUrl: 'https://place.map.kakao.com/8041485',
        sourceTitle: '이마트 오산점'
      }),
      citations: [{ url: 'https://place.map.kakao.com/8041485', title: '이마트 오산점' }]
    });
    llmService.searchWeb.mockResolvedValueOnce({
      text: JSON.stringify({
        openingHours: '매일 10:00-24:00',
        sourceUrl: 'https://place.map.kakao.com/21312240',
        sourceTitle: '홈플러스 오산점'
      }),
      citations: [{ url: 'https://place.map.kakao.com/21312240', title: '홈플러스 오산점' }]
    });
    llmService.chat.mockResolvedValue('이마트 오산점은 매일 10:00-22:00로 확인됩니다.');
    const service = new RagService(
      prisma as never,
      embeddingService as never,
      vectorSearchService as never,
      llmService as never,
      mcpClientService as never
    );

    const result = await service.ask({
      question: '오산 근처 마트 어디 있어? 운영시간도 알려줘'
    });

    expect(llmService.searchWeb).toHaveBeenCalledWith(
      expect.stringContaining('이마트 오산점 경기 오산시 경기대로 181 영업시간')
    );
    const userMessage = llmService.chat.mock.calls[0][0][1].content;
    expect(userMessage).toContain('운영시간: 매일 10:00-22:00');
    expect(userMessage).toContain('운영시간 출처: https://place.map.kakao.com/8041485');
    expect(result.externalSources).toEqual([
      expect.objectContaining({
        name: '이마트 오산점',
        openingHours: '매일 10:00-22:00',
        hoursSourceUrl: 'https://place.map.kakao.com/8041485'
      }),
      expect.objectContaining({
        name: '홈플러스 오산점',
        openingHours: '매일 10:00-24:00',
        hoursSourceUrl: 'https://place.map.kakao.com/21312240'
      })
    ]);
  });

  it('ask does not call external place search for non-place questions', async () => {
    vectorSearchService.search.mockResolvedValue([
      { sourceType: 'POST', sourceId: 'post-1', content: '이번 주말 플리마켓은 우천 시 실내로 변경됩니다.', similarity: 0.84 }
    ]);
    llmService.chat.mockResolvedValue('플리마켓 게시글을 참고하세요.');
    const service = new RagService(
      prisma as never,
      embeddingService as never,
      vectorSearchService as never,
      llmService as never,
      mcpClientService as never
    );

    await service.ask({
      question: '이번 주말 플리마켓 열려?'
    });

    expect(mcpClientService.callTool).not.toHaveBeenCalled();
  });

  it('ask keeps directly matched vector sources before unrelated nearest rows', async () => {
    vectorSearchService.search.mockResolvedValue([
      { sourceType: 'POST', sourceId: 'post-1', content: '오산 야간 약국 정보', similarity: 0.82 },
      { sourceType: 'POST', sourceId: 'post-2', content: '오산역 분실물 안내', similarity: 0.79 }
    ]);
    llmService.chat.mockResolvedValue('야간 약국 정보 게시글을 확인하세요.');
    const service = new RagService(
      prisma as never,
      embeddingService as never,
      vectorSearchService as never,
      llmService as never
    );

    const result = await service.ask({
      question: '근처 야간 약국 어디 있어?'
    });

    expect(result.sources.map((source) => source.sourceId)).toEqual(['post-1']);
  });

  it('ask falls back to keyword post search when vector search returns no sources', async () => {
    vectorSearchService.search.mockResolvedValue([]);
    prisma.post.findMany.mockResolvedValue([
      {
        id: 'post-1',
        title: '오산 야간 약국 정보 모아봐요',
        content: '오산역과 원동 주변 야간 약국 정보를 댓글로 모아두면 좋겠습니다.',
        regionId: 'osan-id',
        category: { name: '병원/약국' },
        region: { name: '오산시' },
        tags: [{ tag: { name: '야간약국' } }, { tag: { name: '생활정보' } }]
      }
    ]);
    llmService.chat.mockResolvedValue('오산 야간 약국 정보 게시글을 먼저 확인해 보세요.');
    const service = new RagService(
      prisma as never,
      embeddingService as never,
      vectorSearchService as never,
      llmService as never
    );

    const result = await service.ask({
      question: '근처 야간 약국 어디 있어?'
    });

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          regionId: 'osan-id'
        })
      })
    );
    expect(result.sources).toEqual([
      expect.objectContaining({
        sourceId: 'post-1',
        content: expect.stringContaining('오산 야간 약국 정보 모아봐요')
      })
    ]);
  });

  it('regional issues resolves OSAN when regionId is missing', async () => {
    prisma.post.findMany.mockResolvedValue([
      {
        id: 'post-1',
        title: '주차 민원',
        content: '불법 주차가 많아요.',
        createdAt: new Date('2026-06-10T00:00:00.000Z')
      }
    ]);
    llmService.chat.mockResolvedValue('최근 오산 이슈는 주차 민원입니다.');
    const service = new RagService(
      prisma as never,
      embeddingService as never,
      vectorSearchService as never,
      llmService as never
    );

    const result = await service.summarizeRegionalIssues({});

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          regionId: 'osan-id'
        })
      })
    );
    expect(result.summary).toBe('최근 오산 이슈는 주차 민원입니다.');
  });
});
