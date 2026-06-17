import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { postInclude, toFeedPosts } from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import { deletePostImages } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const { id } = await params;

  const post = await prisma.post.findFirst({
    where: {
      id,
      status: "PUBLISHED",
      visibility: "PUBLIC",
    },
    include: postInclude,
  });

  if (!post) {
    return NextResponse.json({ message: "포스트를 찾을 수 없습니다." }, { status: 404 });
  }

  const [feedPost] = await toFeedPosts([post], session?.user?.id);

  return NextResponse.json({ post: feedPost });
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
  const post = await prisma.post.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      authorId: true,
      status: true,
      images: {
        select: {
          url: true,
        },
      },
    },
  });

  if (!post || post.status === "DELETED") {
    return NextResponse.json({ message: "이미 삭제된 포스트입니다." }, { status: 404 });
  }

  if (post.authorId !== session.user.id) {
    return NextResponse.json({ message: "본인 글만 삭제할 수 있습니다." }, { status: 403 });
  }

  await prisma.post.update({
    where: {
      id: post.id,
    },
    data: {
      status: "DELETED",
    },
  });

  await deletePostImages(post.images.map((image) => image.url));

  return NextResponse.json({ ok: true });
}
