// 라이브 피드 행 — 방금 올라온 물건 목록 (home.jsx FeedRow 이식)
import Link from "next/link";
import { Chip, Photo } from "@/components/ds";
import { formatPrice, timeAgo } from "@/lib/format";
import type { ProductListItem } from "@/lib/queries/products";
import { statusChip } from "./statusChip";

const LIVE_WINDOW_MS = 10 * 60_000; // 10분 이내면 live dot

export function FeedRow({ product }: { product: ProductListItem }) {
  const chip = statusChip(product);
  const done = product.status === "DONE";
  const live = Date.now() - product.createdAt.getTime() < LIVE_WINDOW_MS;
  return (
    <Link href={`/products/${product.id}`} style={{ display: "block" }}>
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: "13px 4px",
          borderBottom: "1px solid var(--border-card)",
          opacity: done ? 0.5 : 1,
        }}
      >
        <Photo label="" radius={12} style={{ width: 56, height: 56, flex: "0 0 auto" }} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              fontWeight: 500,
              fontSize: 14,
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
                fontSize: 14,
                color: product.price === 0 ? "var(--jm-warning)" : "var(--text-body)",
              }}
            >
              {formatPrice(product.price)}
            </span>
            {chip && <Chip tone={chip.tone}>{chip.label}</Chip>}
          </div>
        </div>
        <div
          style={{
            textAlign: "right",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 6,
          }}
        >
          {live && <span className="jm-dot" />}
          <span
            style={{
              fontSize: 11.5,
              color: live ? "var(--accent)" : "var(--text-tertiary)",
              fontWeight: live ? 700 : 400,
            }}
          >
            {timeAgo(product.createdAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}
