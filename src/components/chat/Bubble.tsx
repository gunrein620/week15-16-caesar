// 말풍선 — 내 메시지는 민트, 상대는 글래스 (chat.jsx Bubble 이식)
export function Bubble({ body, me }: { body: string; me: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: me ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "72%",
          padding: "11px 15px",
          borderRadius: 18,
          fontSize: 14.5,
          lineHeight: 1.5,
          background: me ? "var(--accent)" : "rgba(255,255,255,0.05)",
          color: me ? "var(--on-accent)" : "var(--text-body)",
          border: me ? "none" : "1px solid var(--border-card)",
          borderBottomRightRadius: me ? 5 : 18,
          borderBottomLeftRadius: me ? 18 : 5,
        }}
      >
        {body}
      </div>
    </div>
  );
}
