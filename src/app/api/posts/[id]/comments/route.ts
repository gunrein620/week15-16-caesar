import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { commentInclude, getPostComments, toFeedComment } from "@/lib/posts";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeContent(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 800) : "";
}

async function findVisiblePost(id: string) {
  return prisma.post.findFirst({
    where: {
      id,
      status: "PUBLISHED",
      visibility: "PUBLIC",
    },
    select: {
      id: true,
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const { id } = await params;

  const post = await findVisiblePost(id);
  if (!post) {
    return NextResponse.json({ message: "포스트를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    comments: await getPostComments(id, session?.user?.id),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const post = await findVisiblePost(id);

  if (!post) {
    return NextResponse.json({ message: "포스트를 찾을 수 없습니다." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { content?: unknown } | null;
  const content = normalizeContent(body?.content);

  if (!content) {
    return NextResponse.json({ message: "댓글 내용을 적어주세요." }, { status: 400 });
  }

  const comment = await prisma.comment.create({
    data: {
      postId: id,
      authorId: session.user.id,
      content,
      status: "PUBLISHED",
    },
    include: commentInclude(session.user.id),
  });

  return NextResponse.json({ comment: toFeedComment(comment) }, { status: 201 });
}
