// POST — 관심(하트) 토글
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ error: "not found" }, { status: 404 });

  const key = { userId_productId: { userId: session.user.id, productId: id } };
  const existing = await prisma.favorite.findUnique({ where: key });
  if (existing) {
    await prisma.favorite.delete({ where: key });
    return NextResponse.json({ favorited: false });
  }
  await prisma.favorite.create({ data: { userId: session.user.id, productId: id } });
  return NextResponse.json({ favorited: true });
}
