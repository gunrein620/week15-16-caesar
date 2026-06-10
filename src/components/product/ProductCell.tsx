// 보드 셀 — 홈 MARKET BOARD의 컴팩트 상품 카드 (home.jsx Cell 이식)
import Link from "next/link";
import { Chip, Icon, Photo } from "@/components/ds";
import { formatPrice, timeAgo } from "@/lib/format";
import type { ProductListItem } from "@/lib/queries/products";
import { statusChip } from "./statusChip";

export function ProductCell({ product, photoHeight = 120 }: { product: ProductListItem; photoHeight?: number }) {
  const chip = statusChip(product);
  const done = product.status === "DONE";
  return (
    <Link href={`/products/${product.id}`}>
      <div
        className="jm-glass-2"
        style={{
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 9,
          opacity: done ? 0.55 : 1,
          height: "100%",
        }}
      >
        <Photo label="상품 사진" radius={12} style={{ height: photoHeight }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "0 2px" }}>
          <div
            style={{
              fontWeight: 500,
              fontSize: 13.5,
              lineHeight: 1.3,
              color: "var(--text-body)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {product.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: 15,
                color: product.price === 0 ? "var(--jm-warning)" : "var(--text-body)",
              }}
            >
              {formatPrice(product.price)}
            </span>
            {chip && <Chip tone={chip.tone}>{chip.label}</Chip>}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11.5,
              color: "var(--text-tertiary)",
            }}
          >
            <Icon name="pin" size={12} color="var(--text-tertiary)" /> {product.location} ·{" "}
            {timeAgo(product.createdAt)}
          </div>
        </div>
      </div>
    </Link>
  );
}
