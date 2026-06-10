// GET / POST — 댓글
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const comments = await prisma.comment.findMany({
    where: { postId: id },
    include: { author: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(comments);
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "body required" }, { status: 400 });

  const comment = await prisma.comment.create({
    data: { body: text, postId: id, authorId: session.user.id },
    include: { author: true },
  });
  return NextResponse.json(comment, { status: 201 });
}
