import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostsService } from './posts.service.js';

describe('PostsService', () => {
  const prisma = {
    $transaction: vi.fn((callback) => callback(prisma)),
    region: {
      findUnique: vi.fn(),
      findMany: vi.fn()
    },
    post: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    },
    tag: {
      upsert: vi.fn()
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
  });

  it('uses OSAN as default region when listing posts without regionId', async () => {
    prisma.region.findUnique.mockResolvedValue({ id: 'osan-id', code: 'OSAN' });
    prisma.region.findMany.mockResolvedValue([{ id: 'osan-id' }, { id: 'osan-dong-id' }]);
    prisma.post.findMany.mockResolvedValue([
      {
        id: 'post-1',
        title: '야간 약국',
        _count: { comments: 2, likes: 3 }
      }
    ]);
    prisma.post.count.mockResolvedValue(0);
    const service = new PostsService(prisma as never);

    const result = await service.findAll({ page: 1, limit: 20 });

    expect(prisma.region.findUnique).toHaveBeenCalledWith({ where: { code: 'OSAN' } });
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          regionId: { in: ['osan-id', 'osan-dong-id'] },
          status: { not: 'DELETED' }
        })
      })
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        commentCount: 2,
        likeCount: 3
      })
    );
  });

  it('creates trimmed tags and connects them to the new post', async () => {
    prisma.post.create.mockResolvedValue({ id: 'post-1' });
    prisma.tag.upsert
      .mockResolvedValueOnce({ id: 'tag-1', name: '야간약국' })
      .mockResolvedValueOnce({ id: 'tag-2', name: '생활정보' });
    const service = new PostsService(prisma as never);

    await service.create('user-1', {
      title: '오산 야간 약국',
      content: '오산역 근처 야간 약국 정보입니다.',
      categoryId: 'category-1',
      regionId: 'region-1',
      tagNames: [' 야간약국 ', '생활정보', '야간약국', '']
    });

    expect(prisma.tag.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        authorId: 'user-1',
        title: '오산 야간 약국',
        tags: {
          create: [{ tagId: 'tag-1' }, { tagId: 'tag-2' }]
        }
      }),
      include: expect.any(Object)
    });
  });

  it('uses OSAN as default region when creating a post without regionId', async () => {
    prisma.region.findUnique.mockResolvedValue({ id: 'osan-id', code: 'OSAN' });
    prisma.post.create.mockResolvedValue({ id: 'post-1', _count: { comments: 0, likes: 0 } });
    const service = new PostsService(prisma as never);

    await service.create('user-1', {
      title: '오산 플리마켓',
      content: '이번 주말 플리마켓 정보를 공유합니다.',
      categoryId: 'category-1'
    } as never);

    expect(prisma.post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        regionId: 'osan-id'
      }),
      include: expect.any(Object)
    });
  });

  it('rejects post update by non-author', async () => {
    prisma.post.findUnique.mockResolvedValue({ id: 'post-1', authorId: 'owner-1' });
    const service = new PostsService(prisma as never);

    await expect(
      service.update('post-1', 'other-user', {
        title: '수정'
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('marks post as DELETED instead of removing it', async () => {
    prisma.post.findUnique.mockResolvedValue({ id: 'post-1', authorId: 'owner-1' });
    prisma.post.update.mockResolvedValue({ id: 'post-1', status: 'DELETED' });
    const service = new PostsService(prisma as never);

    await service.remove('post-1', 'owner-1');

    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { status: 'DELETED' }
    });
  });

  it('throws not found when default OSAN region is missing', async () => {
    prisma.region.findUnique.mockResolvedValue(null);
    const service = new PostsService(prisma as never);

    await expect(service.findAll({})).rejects.toBeInstanceOf(NotFoundException);
  });
});
