import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const listInclude = {
  category: true,
  _count: { select: { favorites: true, rooms: true } },
} satisfies Prisma.ProductInclude;

export type ProductListItem = Prisma.ProductGetPayload<{ include: typeof listInclude }>;

export async function listProducts(opts: {
  q?: string;
  category?: string;
  take?: number;
  skip?: number;
} = {}) {
  const where: Prisma.ProductWhereInput = {};
  if (opts.q) {
    where.OR = [
      { title: { contains: opts.q, mode: "insensitive" } },
      { description: { contains: opts.q, mode: "insensitive" } },
    ];
  }
  if (opts.category) where.category = { name: opts.category };

  return prisma.product.findMany({
    where,
    include: listInclude,
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 8,
    skip: opts.skip ?? 0,
  });
}

export async function getProduct(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      seller: true,
      images: { orderBy: { order: "asc" } },
      _count: { select: { favorites: true, rooms: true } },
    },
  });
}

/** 같은 판매자의 다른 물건 (상세 하단 4열) */
export async function getSellerOtherProducts(sellerId: string, excludeId: string, take = 4) {
  return prisma.product.findMany({
    where: { sellerId, id: { not: excludeId } },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function listCategories() {
  return prisma.category.findMany({ orderBy: { order: "asc" } });
}
