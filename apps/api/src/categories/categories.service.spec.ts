import { describe, expect, it, vi } from 'vitest';
import { CategoriesService } from './categories.service.js';

describe('CategoriesService', () => {
  it('returns categories ordered by name', async () => {
    const prisma = {
      category: {
        findMany: vi.fn().mockResolvedValue([{ id: 'category-1', name: '동네생활' }])
      }
    };
    const service = new CategoriesService(prisma as never);

    const result = await service.findAll();

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' }
    });
    expect(result).toEqual([{ id: 'category-1', name: '동네생활' }]);
  });
});
