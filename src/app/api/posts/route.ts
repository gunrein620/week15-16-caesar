// GET /api/posts — 목록 (검색·태그·페이징) / POST — 글쓰기
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPosts } from "@/lib/queries/posts";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const result = await listPosts({
    q: url.searchParams.get("q") ?? undefined,
    tag: url.searchParams.get("tag") ?? undefined,
    page: Number(url.searchParams.get("page")) || 1,
  });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const tagNames: string[] = Array.isArray(body?.tags)
    ? body.tags.filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0)
    : [];

  if (!title || !content) {
    return NextResponse.json({ error: "title and content required" }, { status: 400 });
  }

  const tags = await Promise.all(
    tagNames.map((name) =>
      prisma.tag.upsert({ where: { name: name.trim() }, update: {}, create: { name: name.trim() } }),
    ),
  );

  const post = await prisma.post.create({
    data: {
      title,
      content,
      authorId: session.user.id,
      tags: { create: tags.map((t) => ({ tagId: t.id })) },
    },
  });
  return NextResponse.json(post, { status: 201 });
}
