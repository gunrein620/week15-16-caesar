// GET / POST — 방 메시지 (폴링 기반 스켈레톤)
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

async function getMyRoom(roomId: string, userId: string) {
  const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
  if (!room || (room.buyerId !== userId && room.sellerId !== userId)) return null;
  return room;
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const room = await getMyRoom(id, session.user.id);
  if (!room) return NextResponse.json({ error: "not found" }, { status: 404 });

  const messages = await prisma.message.findMany({
    where: { roomId: id },
    include: { sender: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(messages);
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const room = await getMyRoom(id, session.user.id);
  if (!room) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "body required" }, { status: 400 });

  const [message] = await Promise.all([
    prisma.message.create({ data: { roomId: id, senderId: session.user.id, body: text } }),
    prisma.chatRoom.update({ where: { id }, data: { updatedAt: new Date() } }),
  ]);
  return NextResponse.json(message, { status: 201 });
}
