import { prisma } from "@junglebob/db";
import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/features/auth/current-user";
import {
  assertReviewAuthor,
  normalizeReviewInput,
  type NormalizedReviewInput
} from "@/features/reviews/review";
import { attachOptionalEmbeddingToChunk } from "@/features/rag/embedding";
import { buildReviewChunkInput } from "@/features/rag/chunk";

const REVIEW_SELECT = {
  id: true,
  authorId: true,
  title: true,
  content: true,
  rating: true,
  imageUrl: true,
  menuNames: true,
  helpfulCount: true,
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

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

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

function statusForError(error: Error): number {
  if (error.message === "review not found") {
    return 404;
  }

  if (error.message === "forbidden") {
    return 403;
  }

  return 400;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const review = await prisma.review.findUnique({
    where: { id },
    select: REVIEW_SELECT
  });

  if (!review) {
    return NextResponse.json({ error: "review not found" }, { status: 404 });
  }

  // 이웃 후기: prev = 더 이전(오래된) 글, next = 더 최신 글 (createdAt 기준)
  const [prev, next] = await Promise.all([
    prisma.review.findFirst({
      where: { createdAt: { lt: review.createdAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true }
    }),
    prisma.review.findFirst({
      where: { createdAt: { gt: review.createdAt } },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true }
    })
  ]);

  return NextResponse.json({ review, neighbors: { prev, next } });
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const existingReview = await prisma.review.findUnique({
      where: { id },
      select: { authorId: true }
    });

    assertReviewAuthor(existingReview, user.id);

    const input = normalizeReviewInput((await request.json()) as Record<string, unknown>);
    const { review, chunk } = await prisma.$transaction(async (tx) => {
      await tx.reviewTag.deleteMany({ where: { reviewId: id } });
      await tx.reviewChunk.deleteMany({ where: { reviewId: id } });

      const updatedReview = await tx.review.update({
        where: { id },
        data: {
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
          reviewId: updatedReview.id,
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
        review: updatedReview,
        chunk: createdChunk
      };
    });

    await attachOptionalEmbeddingToChunk(prisma, chunk);

    return NextResponse.json({ review });
  } catch (error) {
    const message = error instanceof Error ? error.message : "review update failed";

    return NextResponse.json({ error: message }, { status: error instanceof Error ? statusForError(error) : 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const existingReview = await prisma.review.findUnique({
      where: { id },
      select: { authorId: true }
    });

    assertReviewAuthor(existingReview, user.id);

    await prisma.review.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "review delete failed";

    return NextResponse.json({ error: message }, { status: error instanceof Error ? statusForError(error) : 400 });
  }
}
