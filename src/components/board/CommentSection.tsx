"use client";

// 댓글 작성 — 입력 + 보내기 (로그인 필요)
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/ds";

export function CommentComposer({ postId, loggedIn }: { postId: string; loggedIn: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  const send = () => {
    const body = text.trim();
    if (!body) return;
    if (!loggedIn) return router.push("/login");
    startTransition(async () => {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.status === 401) return router.push("/login");
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
      <input
        className="jm-input"
        style={{ flex: 1 }}
        placeholder={loggedIn ? "따뜻한 댓글을 남겨 주세요" : "로그인하고 댓글을 남겨 보세요"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="submit"
        className="jm-cta"
        disabled={pending}
        aria-label="댓글 등록"
        style={{ width: 50, height: 50, padding: 0, justifyContent: "center", borderRadius: 16 }}
      >
        <Icon name="send" size={18} color="var(--on-accent)" />
      </button>
    </form>
  );
}
