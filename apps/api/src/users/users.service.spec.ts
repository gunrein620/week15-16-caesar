import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  const prisma = {
    region: {
      findUnique: vi.fn()
    },
    user: {
      update: vi.fn()
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unknown default region', async () => {
    prisma.region.findUnique.mockResolvedValue(null);
    const service = new UsersService(prisma as never);

    await expect(service.updateMyRegion('user-1', 'missing-region')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('updates only the authenticated user default region', async () => {
    prisma.region.findUnique.mockResolvedValue({ id: 'region-1' });
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'a@local.test',
      nickname: '오산주민',
      defaultRegionId: 'region-1'
    });
    const service = new UsersService(prisma as never);

    const result = await service.updateMyRegion('user-1', 'region-1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { defaultRegionId: 'region-1' },
      select: {
        id: true,
        email: true,
        nickname: true,
        defaultRegionId: true
      }
    });
    expect(result.defaultRegionId).toBe('region-1');
  });

  it('maps missing authenticated user during region update to unauthorized', async () => {
    prisma.region.findUnique.mockResolvedValue({ id: 'region-1' });
    prisma.user.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: 'test'
      })
    );
    const service = new UsersService(prisma as never);

    await expect(service.updateMyRegion('deleted-user', 'region-1')).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });
});
