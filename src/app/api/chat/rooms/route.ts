// GET — 내 채팅방 목록 / POST — 채팅 시작 (이미 있으면 기존 방 반환)
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listRooms } from "@/lib/queries/chat";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rooms = await listRooms(session.user.id);
  return NextResponse.json(rooms);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const productId = typeof body?.productId === "string" ? body.productId : "";
  if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (product.sellerId === session.user.id) {
    return NextResponse.json({ error: "cannot chat with yourself" }, { status: 400 });
  }

  const room = await prisma.chatRoom.upsert({
    where: { productId_buyerId: { productId, buyerId: session.user.id } },
    update: {},
    create: { productId, buyerId: session.user.id, sellerId: product.sellerId },
  });
  return NextResponse.json(room, { status: 201 });
}
