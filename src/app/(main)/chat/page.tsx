// ④ 채팅 / 거래 — A안 3분할 (대화 목록 | 스레드 | DEAL INFO)
import { redirect } from "next/navigation";
import { Avatar, Chip, Divider, Eyebrow, Glass, Pill } from "@/components/ds";
import { Bubble } from "@/components/chat/Bubble";
import { Composer } from "@/components/chat/Composer";
import { ProductHead } from "@/components/chat/ProductHead";
import { RoomRow } from "@/components/chat/RoomRow";
import { ScheduleCard } from "@/components/chat/ScheduleCard";
import { currentUser } from "@/lib/auth";
import { meetTime } from "@/lib/format";
import { getRoom, listRooms, markRoomRead } from "@/lib/queries/chat";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.nickname) redirect("/signup");

  const { room: roomParam } = await searchParams;
  const rooms = await listRooms(user.id);
  const activeId = roomParam ?? rooms[0]?.id;
  const active = activeId ? await getRoom(activeId, user.id) : null;
  if (active) {
    await markRoomRead(active.id, user.id);
  }

  const other = active ? (active.buyerId === user.id ? active.seller : active.buyer) : null;
  const otherName = other?.nickname ?? other?.name ?? "이웃";

  return (
    // 모바일: ?room= 없으면 목록 뷰, 있으면 스레드 뷰 (responsive.css .jm-grid-chat)
    <div className={"jm-grid-chat" + (roomParam ? " has-room" : "")}>
      {/* 대화 목록 */}
      <Glass className="jm-chat-list">
        <div style={{ padding: "4px 6px 8px" }}>
          <Eyebrow>CHATS</Eyebrow>
          <h2 className="jm-title" style={{ fontSize: 19, marginTop: 8 }}>
            대화 목록
          </h2>
        </div>
        {rooms.length === 0 ? (
          <div style={{ padding: "20px 12px", fontSize: 13.5, color: "var(--text-tertiary)" }}>
            아직 대화가 없어요. 마음에 드는 물건에서 채팅을 시작해 보세요.
          </div>
        ) : (
          rooms.map((r) => <RoomRow key={r.id} room={r} meId={user.id} active={r.id === active?.id} />)
        )}
      </Glass>

      {/* 스레드 */}
      <Glass className="jm-chat-thread">
        {active && other ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 4 }}>
              <Pill ghost href="/chat" className="jm-show-mobile" style={{ padding: "8px 12px" }}>
                ←
              </Pill>
              <Avatar size={40} label={otherName[0]} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{otherName}</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  {other.town ?? "동네 미설정"} · 보통 1시간 내 응답
                </div>
              </div>
              <Chip tone="mint">매너 {other.mannerTemp.toFixed(1)}℃</Chip>
            </div>
            <Divider />
            <ProductHead product={active.product} />
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: "6px 2px",
                overflowY: "auto",
                justifyContent: "flex-end",
              }}
            >
              {active.messages[0] && (
                <div style={{ textAlign: "center", fontSize: 11.5, color: "var(--text-tertiary)" }}>
                  {meetTime(active.messages[0].createdAt)}
                </div>
              )}
              {active.messages.map((m) => (
                <Bubble key={m.id} body={m.body} me={m.senderId === user.id} />
              ))}
            </div>
            <Composer roomId={active.id} />
          </>
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-tertiary)",
              fontSize: 14,
            }}
          >
            대화를 선택해 주세요
          </div>
        )}
      </Glass>

      {/* DEAL INFO */}
      <Glass className="jm-chat-info">
        <Eyebrow>DEAL INFO</Eyebrow>
        {active ? (
          <>
            <ProductHead product={active.product} compact />
            <ScheduleCard room={active} product={active.product} />
          </>
        ) : (
          <div style={{ fontSize: 13.5, color: "var(--text-tertiary)" }}>진행 중인 거래가 없어요.</div>
        )}
      </Glass>
    </div>
  );
}
