// ② 상품 상세 — A안 좌우 분할 (사진 | 메타·판매자·CTA) + 판매자의 다른 물건
import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip, Divider, Eyebrow, Glass, Photo } from "@/components/ds";
import { DetailActions } from "@/components/product/DetailActions";
import { SellerCard } from "@/components/product/SellerCard";
import { statusChip } from "@/components/product/statusChip";
import { currentUser } from "@/lib/auth";
import { formatPrice, timeAgo } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getProduct, getSellerOtherProducts } from "@/lib/queries/products";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, user] = await Promise.all([getProduct(id), currentUser()]);
  if (!product) notFound();

  const [others, favorited] = await Promise.all([
    getSellerOtherProducts(product.sellerId, product.id),
    user
      ? prisma.favorite
          .findUnique({ where: { userId_productId: { userId: user.id, productId: product.id } } })
          .then(Boolean)
      : false,
    // 조회수 증가 (스켈레톤: 단순 카운트)
    prisma.product.update({ where: { id }, data: { viewCount: { increment: 1 } } }),
  ]);

  const chip = statusChip(product);
  const sellerName = product.seller.nickname ?? product.seller.name ?? "이웃";

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 18, flex: 1, minHeight: 0 }}>
        {/* 사진 */}
        <Glass style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <Photo label="대표 사진 1280×960" radius={18} style={{ flex: 1, minHeight: 380 }} />
          <div style={{ display: "flex", gap: 10 }}>
            {[1, 2, 3, 4].map((i) => (
              <Photo key={i} label="" radius={12} style={{ width: 70, height: 70 }} />
            ))}
          </div>
        </Glass>

        {/* 메타 + 판매자 + 액션 */}
        <Glass style={{ padding: 26, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {chip && <Chip tone={chip.tone}>{chip.label}</Chip>}
              <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                {product.category.name} · {timeAgo(product.createdAt)}
              </span>
            </div>
            <h1 className="jm-title" style={{ fontSize: 26 }}>
              {product.title}
            </h1>
            <div style={{ fontWeight: 700, fontSize: 28 }}>{formatPrice(product.price)}</div>
            <div style={{ fontSize: 14.5, color: "var(--text-secondary)", lineHeight: 1.7 }}>
              {product.description}
            </div>
            <div style={{ display: "flex", gap: 18, fontSize: 13, color: "var(--text-tertiary)", paddingTop: 4 }}>
              <span>관심 {product._count.favorites}</span>
              <span>채팅 {product._count.rooms}</span>
              <span>조회 {product.viewCount + 1}</span>
            </div>
          </div>
          <Divider />
          <SellerCard seller={product.seller} />
          <div style={{ flex: 1 }} />
          <DetailActions productId={product.id} favorited={favorited} isMine={user?.id === product.sellerId} />
        </Glass>
      </div>

      {/* 판매자의 다른 물건 */}
      {others.length > 0 && (
        <Glass style={{ padding: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Eyebrow icon={false}>{sellerName}님의 다른 물건</Eyebrow>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
              {others.map((p) => (
                <Link key={p.id} href={`/products/${p.id}`}>
                  <div className="jm-glass-2" style={{ padding: 9 }}>
                    <Photo label="" radius={10} style={{ height: 84 }} />
                    <div
                      style={{
                        fontSize: 12.5,
                        marginTop: 7,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {p.title}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{formatPrice(p.price)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </Glass>
      )}
    </>
  );
}
