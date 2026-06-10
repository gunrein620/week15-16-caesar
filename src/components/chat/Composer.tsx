"use client";

// 메시지 입력 — 전송 후 refresh (폴링 기반 스켈레톤, WebSocket은 추후)
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/ds";

export function Composer({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  const send = () => {
    const body = text.trim();
    if (!body) return;
    startTransition(async () => {
      const res = await fetch(`/api/chat/rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        setText("");
        router.refresh();
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      style={{ display: "flex", gap: 10, alignItems: "center" }}
    >
      <span
        className="jm-pill is-ghost"
        style={{ width: 46, height: 46, justifyContent: "center", borderRadius: 14, padding: 0 }}
      >
        <Icon name="plus" size={18} color="var(--text-secondary)" />
      </span>
      <input
        className="jm-input"
        style={{ flex: 1 }}
        placeholder="메시지를 입력하세요"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="submit"
        className="jm-cta"
        disabled={pending}
        aria-label="보내기"
        style={{ width: 50, height: 50, padding: 0, justifyContent: "center", borderRadius: 16 }}
      >
        <Icon name="send" size={18} color="var(--on-accent)" />
      </button>
    </form>
  );
}
