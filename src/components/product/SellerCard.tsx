// 판매자 카드 — 아바타 + 닉네임/동네 + 매너온도 바 (detail.jsx Seller 이식)
import { Avatar } from "@/components/ds";
import type { User } from "@prisma/client";

export function SellerCard({ seller, compact }: { seller: User; compact?: boolean }) {
  const name = seller.nickname ?? seller.name ?? "이웃";
  const pct = Math.min(100, Math.round((seller.mannerTemp / 70) * 100));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Avatar size={compact ? 40 : 48} label={name[0]} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{name}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
          {seller.town ?? "동네 미설정"} · 매너온도 {seller.mannerTemp.toFixed(1)}℃
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "var(--accent)" }}>
          {seller.mannerTemp.toFixed(1)}℃
        </div>
        <div
          style={{
            width: 64,
            height: 5,
            borderRadius: 999,
            background: "rgba(255,255,255,0.08)",
            marginTop: 5,
            overflow: "hidden",
          }}
        >
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
        </div>
      </div>
    </div>
  );
}
