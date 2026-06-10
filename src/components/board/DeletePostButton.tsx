"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Pill } from "@/components/ds";

export function DeletePostButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const remove = () => {
    if (!confirm("이 글을 삭제할까요?")) return;
    startTransition(async () => {
      const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/board");
        router.refresh();
      }
    });
  };

  return (
    <Pill ghost onClick={remove} style={{ opacity: pending ? 0.5 : 1 }}>
      삭제
    </Pill>
  );
}
