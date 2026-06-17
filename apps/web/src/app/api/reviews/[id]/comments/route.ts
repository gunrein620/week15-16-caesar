import { prisma } from "@junglebob/db";
import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/features/auth/current-user";
import { normalizeCommentInput } from "@/features/comments/comment";
import { attachOptionalEmbeddingToChunk } from "@/features/rag/embedding";
import { buildCommentChunkInput } from "@/features/rag/chunk";

const COMMENT_SELECT = {
  id: true,
  authorId: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: {
      id: true,
      name: true
    }
  }
} as const;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const review = await prisma.review.findUnique({
    where: { id },
    select: { id: true }
  });

  if (!review) {
    return NextResponse.json({ error: "review not found" }, { status: 404 });
  }

  const comments = await prisma.comment.findMany({
    where: { reviewId: id },
    orderBy: { createdAt: "asc" },
    select: COMMENT_SELECT
  });

  return NextResponse.json({ comments });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const review = await prisma.review.findUnique({
      where: { id },
      select: { id: true, title: true }
    });

    if (!review) {
      return NextResponse.json({ error: "review not found" }, { status: 404 });
    }

    const input = normalizeCommentInput((await request.json()) as Record<string, unknown>);
    const { comment, chunk } = await prisma.$transaction(async (tx) => {
      const createdComment = await tx.comment.create({
        data: {
          reviewId: id,
          authorId: user.id,
          content: input.content
        },
        select: COMMENT_SELECT
      });

      const createdChunk = await tx.reviewChunk.create({
        data: buildCommentChunkInput({
          commentId: createdComment.id,
          reviewId: id,
          reviewTitle: review.title,
          content: input.content
        }),
        select: {
          id: true,
          content: true
        }
      });

      return {
        comment: createdComment,
        chunk: createdChunk
      };
    });

    await attachOptionalEmbeddingToChunk(prisma, chunk);

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "comment create failed";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
