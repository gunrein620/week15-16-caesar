import { describe, expect, it, vi } from 'vitest';
import { RagIngestionService } from './rag-ingestion.service.js';

describe('RagIngestionService', () => {
  it('upserts post embeddings with raw vector SQL', async () => {
    const prisma = {
      post: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'post-1',
          title: '오산 야간 약국',
          content: '오산역 근처 야간 약국 정보입니다.',
          status: 'PUBLISHED',
          regionId: 'osan-id',
          category: { name: '생활정보' },
          region: { name: '오산시' },
          tags: [{ tag: { name: '야간약국' } }]
        })
      },
      comment: {
        findUnique: vi.fn()
      },
      $executeRawUnsafe: vi.fn()
    };
    const embeddingService = {
      createEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
    };
    const service = new RagIngestionService(prisma as never, embeddingService as never);

    await service.indexPost('post-1');

    expect(embeddingService.createEmbedding).toHaveBeenCalledWith(
      expect.stringContaining('오산 야간 약국')
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT ("sourceType", "sourceId") DO UPDATE'),
      expect.any(String),
      'POST',
      'post-1',
      'osan-id',
      expect.stringContaining('오산 야간 약국'),
      '[0.1,0.2,0.3]'
    );
  });

  it('deletes comment embeddings for a deleted parent post', async () => {
    const prisma = {
      post: {
        findUnique: vi.fn()
      },
      comment: {
        findMany: vi.fn().mockResolvedValue([{ id: 'comment-1' }, { id: 'comment-2' }]),
        findUnique: vi.fn()
      },
      $executeRawUnsafe: vi.fn()
    };
    const embeddingService = {
      createEmbedding: vi.fn()
    };
    const service = new RagIngestionService(prisma as never, embeddingService as never);

    await service.deleteCommentEmbeddingsForPost('post-1');

    expect(prisma.comment.findMany).toHaveBeenCalledWith({
      where: { postId: 'post-1' },
      select: { id: true }
    });
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM "embeddings"'),
      'COMMENT',
      'comment-1'
    );
  });

  it('reindexes child comments when parent post context changes', async () => {
    const prisma = {
      post: {
        findUnique: vi.fn()
      },
      comment: {
        findMany: vi.fn().mockResolvedValue([{ id: 'comment-1' }]),
        findUnique: vi.fn().mockResolvedValue({
          id: 'comment-1',
          content: '댓글 내용',
          post: {
            title: '수정된 게시글',
            status: 'PUBLISHED',
            regionId: 'osan-id',
            region: { name: '오산시' }
          }
        })
      },
      $executeRawUnsafe: vi.fn()
    };
    const embeddingService = {
      createEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
    };
    const service = new RagIngestionService(prisma as never, embeddingService as never);

    await service.reindexCommentsForPost('post-1');

    expect(prisma.comment.findMany).toHaveBeenCalledWith({
      where: { postId: 'post-1' },
      select: { id: true }
    });
    expect(embeddingService.createEmbedding).toHaveBeenCalledWith(expect.stringContaining('수정된 게시글'));
  });
});
