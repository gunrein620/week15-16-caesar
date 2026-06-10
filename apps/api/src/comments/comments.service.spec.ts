import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentsService } from './comments.service.js';

describe('CommentsService', () => {
  const prisma = {
    post: {
      findUnique: vi.fn()
    },
    comment: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a comment for the authenticated user', async () => {
    prisma.post.findUnique.mockResolvedValue({ id: 'post-1', status: 'PUBLISHED' });
    prisma.comment.create.mockResolvedValue({ id: 'comment-1' });
    const service = new CommentsService(prisma as never);

    await service.create('post-1', 'user-1', { content: '좋은 정보 감사합니다.' });

    expect(prisma.comment.create).toHaveBeenCalledWith({
      data: {
        postId: 'post-1',
        authorId: 'user-1',
        content: '좋은 정보 감사합니다.'
      }
    });
  });

  it('rejects comment creation on a missing or deleted post', async () => {
    prisma.post.findUnique.mockResolvedValue({ id: 'post-1', status: 'DELETED' });
    const service = new CommentsService(prisma as never);

    await expect(
      service.create('post-1', 'user-1', {
        content: '이미 삭제된 글에는 댓글을 달 수 없습니다.'
      })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  it('rejects comment update by non-author', async () => {
    prisma.comment.findUnique.mockResolvedValue({
      id: 'comment-1',
      authorId: 'owner-1',
      post: { status: 'PUBLISHED' }
    });
    const service = new CommentsService(prisma as never);

    await expect(
      service.update('comment-1', 'other-user', {
        content: '수정'
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects comment update when the parent post is deleted', async () => {
    prisma.comment.findUnique.mockResolvedValue({
      id: 'comment-1',
      authorId: 'user-1',
      post: { status: 'DELETED' }
    });
    const service = new CommentsService(prisma as never);

    await expect(
      service.update('comment-1', 'user-1', {
        content: '삭제된 게시글의 댓글은 수정할 수 없습니다.'
      })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.comment.update).not.toHaveBeenCalled();
  });

  it('rejects comment removal when the parent post is deleted', async () => {
    prisma.comment.findUnique.mockResolvedValue({
      id: 'comment-1',
      authorId: 'user-1',
      post: { status: 'DELETED' }
    });
    const service = new CommentsService(prisma as never);

    await expect(service.remove('comment-1', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.comment.delete).not.toHaveBeenCalled();
  });
});
