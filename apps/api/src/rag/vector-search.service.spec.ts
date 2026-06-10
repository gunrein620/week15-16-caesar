import { afterEach, describe, expect, it, vi } from 'vitest';
import { VectorSearchService } from './vector-search.service.js';

describe('VectorSearchService', () => {
  const originalDim = process.env.EMBEDDING_DIM;

  afterEach(() => {
    process.env.EMBEDDING_DIM = originalDim;
  });

  it('queries the embeddings table using pgvector cosine distance', async () => {
    process.env.EMBEDDING_DIM = '3';
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([
        {
          id: 'embedding-1',
          sourceType: 'POST',
          sourceId: 'post-1',
          content: '오산 야간 약국',
          regionId: 'osan-id',
          similarity: 0.91
        }
      ])
    };
    const service = new VectorSearchService(prisma as never);

    const result = await service.search({
      embedding: [0.1, 0.2, 0.3],
      regionId: 'osan-id',
      limit: 5,
      sourceTypes: ['POST']
    });

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('FROM "embeddings"'),
      '[0.1,0.2,0.3]',
      'osan-id',
      5,
      'POST'
    );
    expect(prisma.$queryRawUnsafe.mock.calls[0][0]).toContain('embedding <=> $1::vector');
    expect(result[0].similarity).toBe(0.91);
  });
});
