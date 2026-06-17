import { prisma } from "@junglebob/db";
import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/features/auth/current-user";
import {
  buildPagination,
  normalizeReviewInput,
  parseReviewListQuery,
  type NormalizedReviewInput
} from "@/features/reviews/review";
import { attachOptionalEmbeddingToChunk } from "@/features/rag/embedding";
import { buildReviewChunkInput } from "@/features/rag/chunk";

const REVIEW_SELECT = {
  id: true,
  title: true,
  content: true,
  rating: true,
  imageUrl: true,
  menuNames: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: {
      id: true,
      name: true
    }
  },
  tags: {
    select: {
      tag: {
        select: {
          name: true
        }
      }
    }
  },
  menuArchive: {
    select: {
      id: true,
      date: true,
      mealType: true
    }
  }
} as const;

function reviewWhere(query: ReturnType<typeof parseReviewListQuery>) {
  return {
    ...(query.query
      ? {
          OR: [
            { title: { contains: query.query, mode: "insensitive" as const } },
            { content: { contains: query.query, mode: "insensitive" as const } },
            { menuNames: { has: query.query } }
          ]
        }
      : {}),
    ...(query.menu ? { menuNames: { has: query.menu } } : {}),
    ...(query.tag
      ? {
          tags: {
            some: {
              tag: {
                name: query.tag
              }
            }
          }
        }
      : {})
  };
}

function tagCreateData(input: NormalizedReviewInput) {
  return input.tags.map((name) => ({
    tag: {
      connectOrCreate: {
        where: { name },
        create: { name }
      }
    }
  }));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = parseReviewListQuery(url.searchParams);
  const where = reviewWhere(query);

  const [total, reviews] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: REVIEW_SELECT
    })
  ]);

  return NextResponse.json({
    reviews,
    pagination: buildPagination({
      total,
      page: query.page,
      pageSize: query.pageSize
    })
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const input = normalizeReviewInput((await request.json()) as Record<string, unknown>);
    const { review, chunk } = await prisma.$transaction(async (tx) => {
      const createdReview = await tx.review.create({
        data: {
          authorId: user.id,
          menuArchiveId: input.menuArchiveId,
          title: input.title,
          content: input.content,
          rating: input.rating,
          imageUrl: input.imageUrl,
          menuNames: input.menuNames,
          tags: {
            create: tagCreateData(input)
          }
        },
        select: REVIEW_SELECT
      });

      const createdChunk = await tx.reviewChunk.create({
        data: buildReviewChunkInput({
          reviewId: createdReview.id,
          title: input.title,
          content: input.content,
          menuNames: input.menuNames,
          tags: input.tags
        }),
        select: {
          id: true,
          content: true
        }
      });

      return {
        review: createdReview,
        chunk: createdChunk
      };
    });

    await attachOptionalEmbeddingToChunk(prisma, chunk);

    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "review create failed";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
