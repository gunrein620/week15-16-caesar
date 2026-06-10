"use client";

// ⑤ 회원가입 — D안 프로필 설정 (닉네임 + 우리 동네)
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar, Cta, Icon } from "@/components/ds";

export function SignupForm({
  initialNickname,
  initialTown,
}: {
  initialNickname: string;
  initialTown: string;
}) {
  const router = useRouter();
  const [nickname, setNickname] = useState(initialNickname);
  const [town, setTown] = useState(initialTown || "역삼동");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    if (!nickname.trim()) return setError("닉네임을 입력해 주세요.");
    startTransition(async () => {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.trim(), town: town.trim() }),
      });
      if (res.status === 401) return router.push("/login");
      if (res.status === 409) return setError("이미 쓰고 있는 닉네임이에요. 다른 이름을 골라 주세요.");
      if (!res.ok) return setError("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
      router.push("/");
      router.refresh();
    });
  };

  return (
    <>
      {/* 프로필 사진 + 닉네임 */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ position: "relative" }}>
          <Avatar size={72} label={(nickname || "N")[0]} style={{ fontSize: 26 }} />
          <span
            style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              width: 26,
              height: 26,
              borderRadius: 999,
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="camera" size={14} color="var(--on-accent)" />
          </span>
        </div>
        <div className="jm-field" style={{ flex: 1 }}>
          <label>닉네임</label>
          <input
            className="jm-input"
            placeholder="동네에서 쓸 이름"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>
      </div>

      {/* 우리 동네 */}
      <div className="jm-field">
        <label>우리 동네</label>
        <div className="jm-input" style={{ gap: 8, padding: "0 18px" }}>
          <Icon name="pin" size={16} color="var(--accent)" />
          <input
            value={town}
            onChange={(e) => setTown(e.target.value)}
            placeholder="동네 이름"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-body)",
              fontSize: 15,
            }}
          />
          <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
            현재 위치로 설정
          </span>
        </div>
      </div>

      {error && <div style={{ color: "var(--jm-danger)", fontSize: 13.5 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Cta block lg onClick={submit} disabled={pending}>
          가입 완료하고 시작하기
        </Cta>
        <div style={{ textAlign: "center", fontSize: 12.5, color: "var(--text-tertiary)" }}>
          닉네임은 나중에 언제든 바꿀 수 있어요
        </div>
      </div>
    </>
  );
}
