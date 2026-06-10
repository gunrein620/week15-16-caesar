import { ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PostStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { RagIngestionService } from '../rag/rag-ingestion.service.js';
import type { CreateCommentDto } from './dto/create-comment.dto.js';
import type { UpdateCommentDto } from './dto/update-comment.dto.js';

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(RagIngestionService) private readonly ragIngestionService?: RagIngestionService
  ) {}

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
    const comment = await this.prisma.comment.create({
      data: {
        postId,
        authorId,
        content: dto.content
      }
    });
    await this.safeIndexComment(comment.id);
    return comment;
  }

  async update(id: string, userId: string, dto: UpdateCommentDto) {
    await this.assertAuthor(id, userId);
    const comment = await this.prisma.comment.update({
      where: { id },
      data: { content: dto.content }
    });
    await this.safeIndexComment(comment.id);
    return comment;
  }

  async remove(id: string, userId: string) {
    await this.assertAuthor(id, userId);
    const comment = await this.prisma.comment.delete({
      where: { id }
    });
    await this.safeDeleteCommentEmbedding(id);
    return comment;
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

  private async safeIndexComment(commentId: string) {
    if (!this.ragIngestionService) {
      return;
    }
    try {
      await this.ragIngestionService.indexComment(commentId);
    } catch (error) {
      this.logger.warn(`Comment RAG indexing skipped for ${commentId}: ${this.errorMessage(error)}`);
    }
  }

  private async safeDeleteCommentEmbedding(commentId: string) {
    if (!this.ragIngestionService) {
      return;
    }
    try {
      await this.ragIngestionService.deleteSource('COMMENT', commentId);
    } catch (error) {
      this.logger.warn(`Comment RAG embedding cleanup skipped for ${commentId}: ${this.errorMessage(error)}`);
    }
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
