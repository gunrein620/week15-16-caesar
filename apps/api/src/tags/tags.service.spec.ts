import { describe, expect, it, vi } from 'vitest';
import { TagsService } from './tags.service.js';

describe('TagsService', () => {
  it('returns tags ordered by name for board filters', async () => {
    const prisma = {
      tag: {
        findMany: vi.fn().mockResolvedValue([{ id: 'tag-1', name: '생활정보' }])
      }
    };
    const service = new TagsService(prisma as never);

    const result = await service.findAll();

    expect(prisma.tag.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' }
    });
    expect(result).toEqual([{ id: 'tag-1', name: '생활정보' }]);
  });
});
