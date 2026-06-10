import { ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PostStatus, Prisma } from '@prisma/client';
import { DEFAULT_REGION_CODE } from '../common/default-region.js';
import { normalizePagination } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RagIngestionService } from '../rag/rag-ingestion.service.js';
import type { CreatePostDto } from './dto/create-post.dto.js';
import type { ListPostsQuery } from './dto/list-posts.query.js';
import type { UpdatePostDto } from './dto/update-post.dto.js';
import { postInclude } from './post-include.js';
import { mapPostWithCounts } from './post-presenter.js';

type PostWriteClient = Pick<PrismaService, 'post' | 'tag'>;

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(RagIngestionService) private readonly ragIngestionService?: RagIngestionService
  ) {}

  async findAll(query: ListPostsQuery) {
    const { page, limit, skip } = normalizePagination(query);
    const regionId = query.regionId ?? (await this.getDefaultRegionId());
    const regionIds = await this.getRegionScopeIds(regionId);
    const where = this.buildPostWhere({ ...query, regionIds });

    const [items, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: postInclude()
      }),
      this.prisma.post.count({ where })
    ]);

    return { items: items.map(mapPostWithCounts), page, limit, total };
  }

  async create(authorId: string, dto: CreatePostDto) {
    const regionId = dto.regionId ?? (await this.getDefaultRegionId());
    const post = await this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as PostWriteClient;
      const tags = await this.resolveTags(client, dto.tagNames);
      return client.post.create({
        data: {
          title: dto.title,
          content: dto.content,
          categoryId: dto.categoryId,
          regionId,
          authorId,
          tags: {
            create: tags.map((tag) => ({ tagId: tag.id }))
          }
        },
        include: postInclude()
      });
    });
    await this.safeIndexPost(post.id);
    return mapPostWithCounts(post);
  }

  async findOne(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: postInclude()
    });
    if (!post || post.status === PostStatus.DELETED) {
      throw new NotFoundException('게시글을 찾을 수 없습니다.');
    }
    return mapPostWithCounts(post);
  }

  async update(id: string, userId: string, dto: UpdatePostDto) {
    const post = await this.assertAuthor(id, userId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as PostWriteClient;
      const tags = dto.tagNames ? await this.resolveTags(client, dto.tagNames) : null;
      return client.post.update({
        where: { id: post.id },
        data: {
          title: dto.title,
          content: dto.content,
          categoryId: dto.categoryId,
          regionId: dto.regionId,
          ...(tags
            ? {
                tags: {
                  deleteMany: {},
                  create: tags.map((tag) => ({ tagId: tag.id }))
                }
              }
            : {})
        },
        include: postInclude()
      });
    });
    await this.safeIndexPost(updated.id);
    await this.safeReindexPostComments(updated.id);
    return mapPostWithCounts(updated);
  }

  async remove(id: string, userId: string) {
    const post = await this.assertAuthor(id, userId);
    const deleted = await this.prisma.post.update({
      where: { id: post.id },
      data: { status: PostStatus.DELETED }
    });
    await this.safeDeletePostEmbedding(post.id);
    await this.safeDeletePostCommentEmbeddings(post.id);
    return deleted;
  }

  private async assertAuthor(id: string, userId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      select: { id: true, authorId: true, status: true }
    });
    if (!post || post.status === PostStatus.DELETED) {
      throw new NotFoundException('게시글을 찾을 수 없습니다.');
    }
    if (post.authorId !== userId) {
      throw new ForbiddenException('게시글 작성자만 수정할 수 있습니다.');
    }
    return post;
  }

  private async resolveTags(client: PostWriteClient, tagNames: string[] = []) {
    const names = [...new Set(tagNames.map((name) => name.trim()).filter(Boolean))];
    return Promise.all(
      names.map((name) =>
        client.tag.upsert({
          where: { name },
          update: {},
          create: { name }
        })
      )
    );
  }

  private async getDefaultRegionId() {
    const region = await this.prisma.region.findUnique({
      where: { code: DEFAULT_REGION_CODE }
    });
    if (!region) {
      throw new NotFoundException('기본 지역을 찾을 수 없습니다.');
    }
    return region.id;
  }

  private async getRegionScopeIds(regionId: string) {
    const regions = await this.prisma.region.findMany({
      where: {
        OR: [{ id: regionId }, { parentId: regionId }]
      },
      select: { id: true }
    });
    return regions.length > 0 ? regions.map((region) => region.id) : [regionId];
  }

  private async safeIndexPost(postId: string) {
    if (!this.ragIngestionService) {
      return;
    }
    try {
      await this.ragIngestionService.indexPost(postId);
    } catch (error) {
      this.logger.warn(`Post RAG indexing skipped for ${postId}: ${this.errorMessage(error)}`);
    }
  }

  private async safeDeletePostEmbedding(postId: string) {
    if (!this.ragIngestionService) {
      return;
    }
    try {
      await this.ragIngestionService.deleteSource('POST', postId);
    } catch (error) {
      this.logger.warn(`Post RAG embedding cleanup skipped for ${postId}: ${this.errorMessage(error)}`);
    }
  }

  private async safeReindexPostComments(postId: string) {
    if (!this.ragIngestionService) {
      return;
    }
    try {
      await this.ragIngestionService.reindexCommentsForPost(postId);
    } catch (error) {
      this.logger.warn(`Post comment RAG reindexing skipped for ${postId}: ${this.errorMessage(error)}`);
    }
  }

  private async safeDeletePostCommentEmbeddings(postId: string) {
    if (!this.ragIngestionService) {
      return;
    }
    try {
      await this.ragIngestionService.deleteCommentEmbeddingsForPost(postId);
    } catch (error) {
      this.logger.warn(`Post comment RAG cleanup skipped for ${postId}: ${this.errorMessage(error)}`);
    }
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private buildPostWhere(query: ListPostsQuery & { regionIds: string[] }): Prisma.PostWhereInput {
    const q = query.q?.trim();
    const tag = query.tag?.trim();
    return {
      status: { not: PostStatus.DELETED },
      regionId: { in: query.regionIds },
      categoryId: query.categoryId,
      ...(q
        ? {
            OR: [{ title: { contains: q } }, { content: { contains: q } }]
          }
        : {}),
      ...(tag
        ? {
            tags: {
              some: {
                tag: { name: tag }
              }
            }
          }
        : {})
    };
  }
}
