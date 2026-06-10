"use client";

// 상세 하단 액션 바 — 관심(하트) + 채팅으로 거래하기 (detail.jsx ActionBar)
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Cta, Icon } from "@/components/ds";

export function DetailActions({
  productId,
  favorited,
  isMine,
}: {
  productId: string;
  favorited: boolean;
  isMine: boolean;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(favorited);
  const [pending, startTransition] = useTransition();

  const toggleFavorite = async () => {
    const res = await fetch(`/api/products/${productId}/favorite`, { method: "POST" });
    if (res.status === 401) return router.push("/login");
    if (res.ok) {
      const data = await res.json();
      setLiked(data.favorited);
      router.refresh();
    }
  };

  const startChat = () => {
    startTransition(async () => {
      const res = await fetch("/api/chat/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (res.status === 401) return router.push("/login");
      if (res.ok) {
        const room = await res.json();
        router.push(`/chat?room=${room.id}`);
      }
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <button
        type="button"
        onClick={toggleFavorite}
        className="jm-pill is-ghost"
        aria-label="관심 목록"
        style={{ width: 50, height: 50, justifyContent: "center", borderRadius: 16, padding: 0 }}
      >
        <Icon name="heart" size={20} color={liked ? "var(--accent)" : "var(--text-secondary)"} />
      </button>
      {isMine ? (
        <Cta lg block secondary style={{ flex: 1 }} href={`/chat`}>
          내 물건 채팅 보기
        </Cta>
      ) : (
        <Cta lg block style={{ flex: 1 }} onClick={startChat} disabled={pending}>
          <Icon name="chat" size={18} color="var(--on-accent)" /> 채팅으로 거래하기
        </Cta>
      )}
    </div>
  );
}
