// 상태 칩 규칙 — 예약중(민트) / 나눔(warn) / 거래완료(muted). 디자인 readme의 status 표기.
import type { ChipTone } from "@/components/ds";
import type { Product } from "@prisma/client";

export function statusChip(
  product: Pick<Product, "status" | "price">,
): { tone: ChipTone; label: string } | null {
  if (product.status === "DONE") return { tone: "muted", label: "거래완료" };
  if (product.status === "RESERVED") return { tone: "mint", label: "예약중" };
  if (product.price === 0) return { tone: "warn", label: "나눔" };
  return null;
}
