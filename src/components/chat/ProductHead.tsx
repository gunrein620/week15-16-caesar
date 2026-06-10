// 거래 중 상품 고정 헤더 (chat.jsx ProductHead 이식)
import Link from "next/link";
import { Chip, Photo } from "@/components/ds";
import { statusChip } from "@/components/product/statusChip";
import { formatPrice } from "@/lib/format";
import type { Product } from "@prisma/client";

export function ProductHead({ product, compact }: { product: Product; compact?: boolean }) {
  const chip = statusChip(product);
  return (
    <Link href={`/products/${product.id}`} style={{ display: "block" }}>
      <div className="jm-glass-2" style={{ padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
        <Photo label="" radius={12} style={{ width: compact ? 44 : 52, height: compact ? 44 : 52 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {chip && <Chip tone={chip.tone}>{chip.label}</Chip>}
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              {product.status === "DONE" ? "거래 종료" : "거래 중"}
            </span>
          </div>
          <div
            style={{
              fontWeight: 700,
              fontSize: 14.5,
              marginTop: 4,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {product.title}
          </div>
        </div>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{formatPrice(product.price)}</span>
      </div>
    </Link>
  );
}
