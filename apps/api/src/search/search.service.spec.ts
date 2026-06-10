import { describe, expect, it, vi } from 'vitest';
import { SearchService } from './search.service.js';
import { BadRequestException } from '@nestjs/common';

describe('SearchService', () => {
  it('searches title and content using default OSAN region when regionId is missing', async () => {
    const prisma = {
      region: {
        findUnique: vi.fn().mockResolvedValue({ id: 'osan-id', code: 'OSAN' }),
        findMany: vi.fn().mockResolvedValue([{ id: 'osan-id' }, { id: 'osan-dong-id' }])
      },
      post: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'post-1',
            title: '야간 약국',
            _count: { comments: 4, likes: 5 }
          }
        ])
      }
    };
    const service = new SearchService(prisma as never);

    const result = await service.searchPosts({ q: '야간 약국', page: 1, limit: 10 });

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          author: expect.any(Object),
          tags: expect.any(Object)
        }),
        where: expect.objectContaining({
          regionId: { in: ['osan-id', 'osan-dong-id'] },
          status: { not: 'DELETED' },
          OR: [{ title: { contains: '야간 약국' } }, { content: { contains: '야간 약국' } }]
        })
      })
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        commentCount: 4,
        likeCount: 5
      })
    );
    expect(result.total).toBe(1);
  });

  it('rejects blank search text before running a broad query', async () => {
    const prisma = {
      region: {
        findUnique: vi.fn(),
        findMany: vi.fn()
      },
      post: {
        count: vi.fn(),
        findMany: vi.fn()
      }
    };
    const service = new SearchService(prisma as never);

    await expect(service.searchPosts({ q: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });
});
