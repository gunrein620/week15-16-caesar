import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const comment = await prisma.comment.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      authorId: true,
      status: true,
    },
  });

  if (!comment || comment.status === "DELETED") {
    return NextResponse.json({ message: "댓글을 찾을 수 없습니다." }, { status: 404 });
  }

  if (comment.authorId !== session.user.id) {
    return NextResponse.json({ message: "본인 댓글만 삭제할 수 있습니다." }, { status: 403 });
  }

  await prisma.comment.update({
    where: {
      id,
    },
    data: {
      status: "DELETED",
    },
  });

  return NextResponse.json({ ok: true });
}
