// 내 거래 — 디자인 번들에 화면 없음 → 디자인 톤의 빈 상태 스텁 (다음 단계에서 설계)
import { Cta, Eyebrow, Glass, Spark } from "@/components/ds";

export default function DealsPage() {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <Glass
        style={{
          width: 480,
          padding: 44,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: 20,
            background: "var(--accent-soft)",
            color: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Spark size={22} />
        </div>
        <Eyebrow dim icon={false}>
          MY DEALS
        </Eyebrow>
        <h1 className="jm-title" style={{ fontSize: 22 }}>
          내 거래 내역을 준비하고 있어요
        </h1>
        <div style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.7 }}>
          판매·구매 내역과 후기를 한곳에서 볼 수 있는
          <br />
          공간이 곧 열려요.
        </div>
        <Cta href="/" style={{ marginTop: 8 }}>
          동네 물건 둘러보기
        </Cta>
      </Glass>
    </div>
  );
}
