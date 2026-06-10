import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const POSTS_PER_PAGE = 8;

const listInclude = {
  author: true,
  tags: { include: { tag: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.PostInclude;

export type PostListItem = Prisma.PostGetPayload<{ include: typeof listInclude }>;

export async function listPosts(opts: { q?: string; tag?: string; page?: number } = {}) {
  const where: Prisma.PostWhereInput = {};
  if (opts.q) {
    where.OR = [
      { title: { contains: opts.q, mode: "insensitive" } },
      { content: { contains: opts.q, mode: "insensitive" } },
    ];
  }
  if (opts.tag) where.tags = { some: { tag: { name: opts.tag } } };

  const page = Math.max(1, opts.page ?? 1);
  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      include: listInclude,
      orderBy: { createdAt: "desc" },
      take: POSTS_PER_PAGE,
      skip: (page - 1) * POSTS_PER_PAGE,
    }),
    prisma.post.count({ where }),
  ]);

  return { posts, total, page, totalPages: Math.max(1, Math.ceil(total / POSTS_PER_PAGE)) };
}

export async function getPost(id: string) {
  return prisma.post.findUnique({
    where: { id },
    include: {
      author: true,
      tags: { include: { tag: true } },
      comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
    },
  });
}

/** 게시글 수 기준 인기 태그 (우측 레일) */
export async function listPopularTags() {
  return prisma.tag.findMany({
    include: { _count: { select: { posts: true } } },
    orderBy: { posts: { _count: "desc" } },
  });
}
