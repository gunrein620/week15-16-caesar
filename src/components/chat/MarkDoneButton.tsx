"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Cta, Icon } from "@/components/ds";

export function MarkDoneButton({ productId, done }: { productId: string; done: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <Cta block secondary disabled>
        <Icon name="check" size={18} /> 거래가 완료됐어요
      </Cta>
    );
  }

  const markDone = () => {
    startTransition(async () => {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DONE" }),
      });
      if (res.ok) router.refresh();
    });
  };

  return (
    <Cta block onClick={markDone} disabled={pending}>
      거래 완료로 표시
    </Cta>
  );
}
