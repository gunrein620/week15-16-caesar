// 거래 약속 카드 — 시간·장소·지도 + 거래 완료 CTA (chat.jsx ScheduleCard 이식)
import { Eyebrow, Glass, Icon, Photo } from "@/components/ds";
import { meetTime, untilMeet } from "@/lib/format";
import type { ChatRoom, Product } from "@prisma/client";
import { MarkDoneButton } from "./MarkDoneButton";

export function ScheduleCard({ room, product }: { room: ChatRoom; product: Product }) {
  return (
    <Glass variant={2} style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <Eyebrow>거래 약속</Eyebrow>
      {room.meetAt ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Icon name="clock" size={20} color="var(--accent)" />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{meetTime(room.meetAt)}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>{untilMeet(room.meetAt)}</div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13.5, color: "var(--text-tertiary)" }}>
          아직 약속이 없어요. 채팅으로 시간을 정해 보세요.
        </div>
      )}
      {room.meetPlace && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Icon name="pin" size={20} color="var(--accent)" />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{room.meetPlace}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>여기서 1.2km</div>
          </div>
        </div>
      )}
      <Photo label="약속 장소 지도" radius={14} style={{ height: 120 }} />
      <MarkDoneButton productId={product.id} done={product.status === "DONE"} />
    </Glass>
  );
}
