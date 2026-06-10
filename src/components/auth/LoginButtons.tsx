"use client";

// 소셜 시작 버튼 — 마커는 상표 로고 대신 중립 색상 칩 (디자인 와이어프레임 그대로,
// 실제 브랜드 가이드 적용은 추후). env에 키가 없는 프로바이더는 비활성 표시.
import { signIn } from "next-auth/react";

type SocialDef = {
  id: string;
  label: string;
  color: string;
  enabled: boolean;
};

export function LoginButtons({
  enabled,
}: {
  enabled: { kakao: boolean; google: boolean; guest: boolean };
}) {
  const socials: SocialDef[] = [
    { id: "kakao", label: "카카오로 시작하기", color: "#f2d34b", enabled: enabled.kakao },
    { id: "naver", label: "네이버로 시작하기", color: "#5fd07a", enabled: false },
    { id: "google", label: "Google로 시작하기", color: "#e8eaed", enabled: enabled.google },
    { id: "apple", label: "Apple로 시작하기", color: "#cfd4d2", enabled: false },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {socials.map((s, i) => {
        const primary = i === 0;
        return (
          <button
            key={s.id}
            type="button"
            disabled={!s.enabled}
            title={s.enabled ? undefined : "OAuth 키 설정 후 사용할 수 있어요 (.env 참고)"}
            onClick={() => signIn(s.id, { redirectTo: "/auth/complete" })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 18px",
              borderRadius: 16,
              background: primary ? s.color : "rgba(255,255,255,0.03)",
              border: primary ? "none" : "1px solid var(--border-card)",
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              fontSize: 15,
              color: primary ? "#1a1206" : "var(--text-body)",
              cursor: s.enabled ? "pointer" : "not-allowed",
              opacity: s.enabled ? 1 : 0.45,
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: s.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                color: "#1a1206",
                flex: "0 0 auto",
              }}
            >
              {s.label[0]}
            </span>
            <span style={{ flex: 1, textAlign: "center" }}>{s.label}</span>
            <span style={{ width: 22 }} />
          </button>
        );
      })}
      {enabled.guest && (
        <button
          type="button"
          className="jm-pill is-ghost"
          style={{ justifyContent: "center", marginTop: 4 }}
          onClick={() => signIn("guest", { redirectTo: "/auth/complete" })}
        >
          게스트로 둘러보기 (개발용)
        </button>
      )}
    </div>
  );
}
