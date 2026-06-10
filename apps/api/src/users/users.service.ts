import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async updateMyRegion(userId: string, regionId: string) {
    const region = await this.prisma.region.findUnique({
      where: { id: regionId }
    });
    if (!region) {
      throw new NotFoundException('지역을 찾을 수 없습니다.');
    }

    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { defaultRegionId: regionId },
        select: {
          id: true,
          email: true,
          nickname: true,
          defaultRegionId: true
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new UnauthorizedException('인증된 사용자를 찾을 수 없습니다.');
      }
      throw error;
    }
  }
}
