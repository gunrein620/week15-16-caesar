import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const roomInclude = {
  product: true,
  buyer: true,
  seller: true,
  messages: { orderBy: { createdAt: "desc" as const }, take: 1 },
} satisfies Prisma.ChatRoomInclude;

export type RoomListItem = Prisma.ChatRoomGetPayload<{ include: typeof roomInclude }> & {
  unread: number;
};

/** 내 채팅방 목록 — 상대/마지막 메시지/안 읽음 수 포함 */
export async function listRooms(userId: string): Promise<RoomListItem[]> {
  const rooms = await prisma.chatRoom.findMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
    include: roomInclude,
    orderBy: { updatedAt: "desc" },
  });

  return Promise.all(
    rooms.map(async (room) => ({
      ...room,
      unread: await prisma.message.count({
        where: { roomId: room.id, senderId: { not: userId }, readAt: null },
      }),
    })),
  );
}

export async function getRoom(roomId: string, userId: string) {
  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    include: {
      product: true,
      buyer: true,
      seller: true,
      messages: { include: { sender: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!room || (room.buyerId !== userId && room.sellerId !== userId)) return null;
  return room;
}

/** 방을 열람할 때 상대 메시지를 읽음 처리 */
export async function markRoomRead(roomId: string, userId: string) {
  await prisma.message.updateMany({
    where: { roomId, senderId: { not: userId }, readAt: null },
    data: { readAt: new Date() },
  });
}
