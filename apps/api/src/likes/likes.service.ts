import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PostStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class LikesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async like(postId: string, userId: string) {
    await this.assertPostCanBeLiked(postId);
    return this.prisma.postLike.upsert({
      where: {
        postId_userId: { postId, userId }
      },
      update: {},
      create: { postId, userId }
    });
  }

  async unlike(postId: string, userId: string) {
    await this.assertPostCanBeLiked(postId);
    try {
      await this.prisma.postLike.delete({
        where: {
          postId_userId: { postId, userId }
        }
      });
      return { deleted: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return { deleted: false };
      }
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2025') {
        return { deleted: false };
      }
      throw error;
    }
  }

  private async assertPostCanBeLiked(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, status: true }
    });
    if (!post || post.status === PostStatus.DELETED) {
      throw new NotFoundException('게시글을 찾을 수 없습니다.');
    }
    return post;
  }
}
