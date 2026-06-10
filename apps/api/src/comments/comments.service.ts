import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PostStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateCommentDto } from './dto/create-comment.dto.js';
import type { UpdateCommentDto } from './dto/update-comment.dto.js';

@Injectable()
export class CommentsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findByPost(postId: string) {
    return this.prisma.comment.findMany({
      where: {
        postId,
        post: {
          status: { not: 'DELETED' }
        }
      },
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          select: {
            id: true,
            nickname: true
          }
        }
      }
    });
  }

  async create(postId: string, authorId: string, dto: CreateCommentDto) {
    await this.assertPostCanReceiveComments(postId);
    return this.prisma.comment.create({
      data: {
        postId,
        authorId,
        content: dto.content
      }
    });
  }

  async update(id: string, userId: string, dto: UpdateCommentDto) {
    await this.assertAuthor(id, userId);
    return this.prisma.comment.update({
      where: { id },
      data: { content: dto.content }
    });
  }

  async remove(id: string, userId: string) {
    await this.assertAuthor(id, userId);
    return this.prisma.comment.delete({
      where: { id }
    });
  }

  private async assertAuthor(id: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
        post: {
          select: {
            status: true
          }
        }
      }
    });
    if (!comment || comment.post.status === PostStatus.DELETED) {
      throw new NotFoundException('댓글을 찾을 수 없습니다.');
    }
    if (comment.authorId !== userId) {
      throw new ForbiddenException('댓글 작성자만 수정할 수 있습니다.');
    }
    return comment;
  }

  private async assertPostCanReceiveComments(postId: string) {
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
