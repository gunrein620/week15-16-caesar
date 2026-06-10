import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_REGION_CODE } from '../common/default-region.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class RegionsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findAll(parentId?: string) {
    return this.prisma.region.findMany({
      where: { parentId: parentId ?? null },
      orderBy: [{ level: 'asc' }, { name: 'asc' }]
    });
  }

  async getDefaultRegion() {
    const region = await this.prisma.region.findUnique({
      where: { code: DEFAULT_REGION_CODE }
    });
    if (!region) {
      throw new NotFoundException('기본 지역을 찾을 수 없습니다.');
    }
    return region;
  }
}
