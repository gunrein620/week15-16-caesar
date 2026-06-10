import { Inject, Injectable } from '@nestjs/common';
import { EmbeddingSourceType, PostStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmbeddingService } from './embedding.service.js';
import { formatVector } from './vector-utils.js';

@Injectable()
export class RagIngestionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmbeddingService) private readonly embeddingService: EmbeddingService
  ) {}

  async indexPost(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        category: true,
        region: true,
        tags: {
          include: {
            tag: true
          }
        }
      }
    });

    if (!post || post.status !== PostStatus.PUBLISHED) {
      await this.deleteSource(EmbeddingSourceType.POST, postId);
      return;
    }

    const content = [
      '[게시글]',
      `제목: ${post.title}`,
      `지역: ${post.region.name}`,
      `카테고리: ${post.category.name}`,
      `태그: ${post.tags.map((postTag) => postTag.tag.name).join(', ')}`,
      `내용: ${post.content}`
    ].join('\n');
    await this.upsertEmbedding(EmbeddingSourceType.POST, post.id, post.regionId, content);
  }

  async indexComment(commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        post: {
          include: {
            region: true
          }
        }
      }
    });

    if (!comment || comment.post.status !== PostStatus.PUBLISHED) {
      await this.deleteSource(EmbeddingSourceType.COMMENT, commentId);
      return;
    }

    const content = [
      '[댓글]',
      `게시글: ${comment.post.title}`,
      `지역: ${comment.post.region.name}`,
      `내용: ${comment.content}`
    ].join('\n');
    await this.upsertEmbedding(EmbeddingSourceType.COMMENT, comment.id, comment.post.regionId, content);
  }

  async reindexCommentsForPost(postId: string) {
    const comments = await this.prisma.comment.findMany({
      where: { postId },
      select: { id: true }
    });
    await Promise.all(comments.map((comment) => this.indexComment(comment.id)));
  }

  async deleteCommentEmbeddingsForPost(postId: string) {
    const comments = await this.prisma.comment.findMany({
      where: { postId },
      select: { id: true }
    });
    await Promise.all(
      comments.map((comment) => this.deleteSource(EmbeddingSourceType.COMMENT, comment.id))
    );
  }

  async deleteSource(sourceType: EmbeddingSourceType, sourceId: string) {
    await this.prisma.$executeRawUnsafe(
      `
      DELETE FROM "embeddings"
      WHERE "sourceType" = $1::"EmbeddingSourceType"
        AND "sourceId" = $2
      `,
      sourceType,
      sourceId
    );
  }

  private async upsertEmbedding(
    sourceType: EmbeddingSourceType,
    sourceId: string,
    regionId: string | null,
    content: string
  ) {
    const embedding = await this.embeddingService.createEmbedding(content);
    await this.prisma.$executeRawUnsafe(
      `
      INSERT INTO "embeddings" ("id", "sourceType", "sourceId", "regionId", content, embedding)
      VALUES ($1, $2::"EmbeddingSourceType", $3, $4, $5, $6::vector)
      ON CONFLICT ("sourceType", "sourceId") DO UPDATE
      SET "regionId" = EXCLUDED."regionId",
          content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          "createdAt" = now()
      `,
      randomUUID(),
      sourceType,
      sourceId,
      regionId,
      content,
      formatVector(embedding)
    );
  }
}
