// ① 홈 / 동네 피드 — A안 보드 그리드 (MARKET BOARD + LIVE FEED)
import { Chip, Cta, Eyebrow, Glass, Icon, Pill } from "@/components/ds";
import { FeedRow } from "@/components/product/FeedRow";
import { ProductCell } from "@/components/product/ProductCell";
import { currentUser } from "@/lib/auth";
import { listCategories, listProducts } from "@/lib/queries/products";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { category, q } = await searchParams;
  const [user, categories, boardItems, feedItems] = await Promise.all([
    currentUser(),
    listCategories(),
    listProducts({ category, q, take: 4 }),
    listProducts({ q, take: 8 }),
  ]);

  return (
    <>
      {/* Hero */}
      <Glass style={{ padding: "24px 30px", display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ flex: 1 }}>
          <Eyebrow>JUNGLE MARKET</Eyebrow>
          <h1 className="jm-title" style={{ fontSize: 30, marginTop: 12 }}>
            우리 동네에서 바로 거래하는 중고 마켓
          </h1>
          <div style={{ color: "var(--text-secondary)", fontSize: 15, marginTop: 8 }}>
            가입은 소셜 로그인으로 한 번. 근처 물건을 보고 채팅으로 바로 약속해요.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Glass variant={2} style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 9 }}>
            <Icon name="pin" size={16} color="var(--accent)" />
            <div>
              <div className="jm-mono">MY TOWN</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{user?.town ?? "역삼동"}</div>
            </div>
          </Glass>
          <Cta lg href="/products/new">
            <Icon name="plus" size={16} color="var(--on-accent)" /> 판매하기
          </Cta>
        </div>
      </Glass>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 18, flex: 1, minHeight: 0 }}>
        {/* Market board */}
        <Glass style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <Eyebrow>MARKET BOARD</Eyebrow>
              <h2 className="jm-title" style={{ fontSize: 21, marginTop: 8 }}>
                {q ? `"${q}" 검색 결과` : "우리 동네 매물"}
              </h2>
            </div>
            <Pill ghost href="/">
              <Icon name="grid" size={14} color="var(--text-secondary)" /> 전체
            </Pill>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Pill on={!category} href="/">
              전체
            </Pill>
            {categories.map((c) => (
              <Pill key={c.id} on={category === c.name} href={`/?category=${encodeURIComponent(c.name)}`}>
                {c.name}
              </Pill>
            ))}
          </div>
          {boardItems.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-tertiary)",
                fontSize: 14,
                minHeight: 200,
              }}
            >
              아직 올라온 물건이 없어요
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, flex: 1 }}>
              {boardItems.map((p) => (
                <ProductCell key={p.id} product={p} />
              ))}
            </div>
          )}
        </Glass>

        {/* Live feed */}
        <Glass style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <Eyebrow>LIVE FEED</Eyebrow>
              <h2 className="jm-title" style={{ fontSize: 21, marginTop: 8 }}>
                방금 올라온 물건
              </h2>
            </div>
            <Chip tone="mint">
              <span className="jm-dot" style={{ width: 6, height: 6 }} /> 실시간
            </Chip>
          </div>
          <div style={{ flex: 1 }}>
            {feedItems.map((p) => (
              <FeedRow key={p.id} product={p} />
            ))}
          </div>
        </Glass>
      </div>
    </>
  );
}
