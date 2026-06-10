// GET / PATCH(상태 변경 포함) / DELETE — 상품 단건
import { NextResponse } from "next/server";
import { ProductStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: true, seller: true, images: true },
  });
  if (!product) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(product);
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const data: Record<string, unknown> = {};

  // 상태 변경은 판매자 또는 거래 당사자(채팅 상대)가 가능 — "거래 완료로 표시"
  if (typeof body?.status === "string") {
    if (!Object.values(ProductStatus).includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    const isSeller = product.sellerId === session.user.id;
    const isParty = await prisma.chatRoom.findFirst({
      where: { productId: id, buyerId: session.user.id },
    });
    if (!isSeller && !isParty) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    data.status = body.status;
  }

  // 나머지 필드는 판매자만
  const sellerFields = ["title", "description", "price", "meetPlace"] as const;
  if (sellerFields.some((f) => body?.[f] !== undefined)) {
    if (product.sellerId !== session.user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
    if (typeof body.description === "string") data.description = body.description;
    if (Number.isInteger(body.price) && body.price >= 0) data.price = body.price;
    if (typeof body.meetPlace === "string") data.meetPlace = body.meetPlace;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  const updated = await prisma.product.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (product.sellerId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
