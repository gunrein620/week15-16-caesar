import { Prisma } from '@prisma/client';

export function postInclude() {
  return {
    author: {
      select: {
        id: true,
        nickname: true
      }
    },
    region: true,
    category: true,
    tags: {
      include: {
        tag: true
      }
    },
    _count: {
      select: {
        comments: true,
        likes: true
      }
    }
  } satisfies Prisma.PostInclude;
}
