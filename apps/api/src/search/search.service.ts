import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PostStatus, Prisma } from '@prisma/client';
import { DEFAULT_REGION_CODE } from '../common/default-region.js';
import { normalizePagination } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { postInclude } from '../posts/post-include.js';
import { mapPostWithCounts } from '../posts/post-presenter.js';
import type { SearchPostsQuery } from './dto/search-posts.query.js';

@Injectable()
export class SearchService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async searchPosts(query: SearchPostsQuery) {
    const { page, limit, skip } = normalizePagination(query);
    const q = query.q?.trim();
    if (!q) {
      throw new BadRequestException('검색어를 입력해 주세요.');
    }
    const regionId = query.regionId ?? (await this.getDefaultRegionId());
    const regionIds = await this.getRegionScopeIds(regionId);
    const where: Prisma.PostWhereInput = {
      status: { not: PostStatus.DELETED },
      regionId: { in: regionIds },
      categoryId: query.categoryId,
      OR: [{ title: { contains: q } }, { content: { contains: q } }]
    };

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
}
