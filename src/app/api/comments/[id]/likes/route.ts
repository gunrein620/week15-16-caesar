import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getCommentLikeSummary } from "@/lib/posts";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function findPublishedComment(id: string) {
  return prisma.comment.findFirst({
    where: {
      id,
      status: "PUBLISHED",
      post: {
        status: "PUBLISHED",
        visibility: "PUBLIC",
      },
    },
    select: {
      id: true,
    },
  });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const comment = await findPublishedComment(id);

  if (!comment) {
    return NextResponse.json({ message: "댓글을 찾을 수 없습니다." }, { status: 404 });
  }

  await prisma.commentLike.upsert({
    where: {
      commentId_userId: {
        commentId: id,
        userId: session.user.id,
      },
    },
    create: {
      commentId: id,
      userId: session.user.id,
    },
    update: {},
  });

  return NextResponse.json(await getCommentLikeSummary(id, session.user.id));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const comment = await findPublishedComment(id);

  if (!comment) {
    return NextResponse.json({ message: "댓글을 찾을 수 없습니다." }, { status: 404 });
  }

  await prisma.commentLike.deleteMany({
    where: {
      commentId: id,
      userId: session.user.id,
    },
  });

  return NextResponse.json(await getCommentLikeSummary(id, session.user.id));
}
