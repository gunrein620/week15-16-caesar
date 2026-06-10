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
    chat: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.region.findUnique.mockResolvedValue({ id: 'osan-id', code: 'OSAN', name: '오산시' });
    embeddingService.createEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
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
