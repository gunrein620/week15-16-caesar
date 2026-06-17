import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getVoteSummary, isSnackVoteType } from "@/lib/posts";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { type?: unknown } | null;

  if (!isSnackVoteType(body?.type)) {
    return NextResponse.json({ message: "알 수 없는 판결입니다." }, { status: 400 });
  }

  const post = await prisma.post.findFirst({
    where: {
      id,
      status: "PUBLISHED",
      visibility: "PUBLIC",
    },
    select: {
      id: true,
    },
  });

  if (!post) {
    return NextResponse.json({ message: "포스트를 찾을 수 없습니다." }, { status: 404 });
  }

  await prisma.vote.upsert({
    where: {
      postId_userId: {
        postId: id,
        userId: session.user.id,
      },
    },
    create: {
      postId: id,
      userId: session.user.id,
      type: body.type,
    },
    update: {
      type: body.type,
    },
  });

  return NextResponse.json(await getVoteSummary(id, session.user.id));
}
