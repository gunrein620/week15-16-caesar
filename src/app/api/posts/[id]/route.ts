// GET / PATCH / DELETE — 게시글 단건 (작성자만 수정·삭제)
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPost } from "@/lib/queries/posts";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(post);
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (post.authorId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const data: { title?: string; content?: string } = {};
  if (typeof body?.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body?.content === "string" && body.content.trim()) data.content = body.content.trim();
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const updated = await prisma.post.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (post.authorId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await prisma.post.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
