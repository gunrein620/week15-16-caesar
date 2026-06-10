import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LikesService } from './likes.service.js';

describe('LikesService', () => {
  it('likes a post idempotently with composite key upsert', async () => {
    const prisma = {
      post: {
        findUnique: vi.fn().mockResolvedValue({ id: 'post-1', status: 'PUBLISHED' })
      },
      postLike: {
        upsert: vi.fn().mockResolvedValue({ postId: 'post-1', userId: 'user-1' })
      }
    };
    const service = new LikesService(prisma as never);

    await service.like('post-1', 'user-1');

    expect(prisma.postLike.upsert).toHaveBeenCalledWith({
      where: {
        postId_userId: {
          postId: 'post-1',
          userId: 'user-1'
        }
      },
      update: {},
      create: {
        postId: 'post-1',
        userId: 'user-1'
      }
    });
  });

  it('rejects likes on a missing or deleted post', async () => {
    const prisma = {
      post: {
        findUnique: vi.fn().mockResolvedValue({ id: 'post-1', status: 'DELETED' })
      },
      postLike: {
        upsert: vi.fn()
      }
    };
    const service = new LikesService(prisma as never);

    await expect(service.like('post-1', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.postLike.upsert).not.toHaveBeenCalled();
  });

  it('unlikes a post idempotently when the like does not exist', async () => {
    const prisma = {
      post: {
        findUnique: vi.fn().mockResolvedValue({ id: 'post-1', status: 'PUBLISHED' })
      },
      postLike: {
        delete: vi.fn().mockRejectedValue({ code: 'P2025' })
      }
    };
    const service = new LikesService(prisma as never);

    await expect(service.unlike('post-1', 'user-1')).resolves.toEqual({ deleted: false });
  });
});
