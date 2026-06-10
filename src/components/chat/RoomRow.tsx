// 대화 목록 행 — 아바타 + 마지막 메시지 + 안 읽음 배지 (chat.jsx RoomRow 이식)
import Link from "next/link";
import { Avatar, Chip } from "@/components/ds";
import { shortTime } from "@/lib/format";
import type { RoomListItem } from "@/lib/queries/chat";

export function RoomRow({
  room,
  meId,
  active,
}: {
  room: RoomListItem;
  meId: string;
  active?: boolean;
}) {
  const other = room.buyerId === meId ? room.seller : room.buyer;
  const name = other.nickname ?? other.name ?? "이웃";
  const done = room.product.status === "DONE";
  const last = room.messages[0];

  return (
    <Link href={`/chat?room=${room.id}`} style={{ display: "block" }}>
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: "12px 12px",
          borderRadius: 16,
          alignItems: "center",
          background: active ? "var(--accent-soft)" : "transparent",
          border: active ? "1px solid var(--border-strong)" : "1px solid transparent",
          opacity: done ? 0.55 : 1,
        }}
      >
        <Avatar size={44} label={name[0]} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontWeight: 700, fontSize: 14.5 }}>{name}</span>
            {done && <Chip tone="muted">거래완료</Chip>}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--text-secondary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: 3,
            }}
          >
            {last?.body ?? room.product.title}
          </div>
        </div>
        <div
          style={{
            textAlign: "right",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 6,
          }}
        >
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {shortTime(last?.createdAt ?? room.createdAt)}
          </span>
          {room.unread > 0 && (
            <span
              style={{
                minWidth: 18,
                height: 18,
                padding: "0 5px",
                borderRadius: 999,
                background: "var(--accent)",
                color: "var(--on-accent)",
                fontSize: 11,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {room.unread}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
