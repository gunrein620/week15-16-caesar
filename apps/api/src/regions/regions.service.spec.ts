import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegionsService } from './regions.service.js';

describe('RegionsService', () => {
  const prisma = {
    region: {
      findMany: vi.fn(),
      findUnique: vi.fn()
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns OSAN as default region', async () => {
    prisma.region.findUnique.mockResolvedValue({ id: 'osan-id', code: 'OSAN', name: '오산시' });
    const service = new RegionsService(prisma as never);

    const result = await service.getDefaultRegion();

    expect(prisma.region.findUnique).toHaveBeenCalledWith({
      where: { code: 'OSAN' }
    });
    expect(result.code).toBe('OSAN');
  });

  it('throws when default OSAN region is missing', async () => {
    prisma.region.findUnique.mockResolvedValue(null);
    const service = new RegionsService(prisma as never);

    await expect(service.getDefaultRegion()).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns top-level regions when parentId is omitted', async () => {
    prisma.region.findMany.mockResolvedValue([{ id: 'gyeonggi', parentId: null }]);
    const service = new RegionsService(prisma as never);

    await service.findAll();

    expect(prisma.region.findMany).toHaveBeenCalledWith({
      where: { parentId: null },
      orderBy: [{ level: 'asc' }, { name: 'asc' }]
    });
  });

  it('returns direct children when parentId is provided', async () => {
    prisma.region.findMany.mockResolvedValue([{ id: 'osan', parentId: 'gyeonggi' }]);
    const service = new RegionsService(prisma as never);

    await service.findAll('gyeonggi');

    expect(prisma.region.findMany).toHaveBeenCalledWith({
      where: { parentId: 'gyeonggi' },
      orderBy: [{ level: 'asc' }, { name: 'asc' }]
    });
  });
});
