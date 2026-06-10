// ⑤ 로그인 — A안 센터 카드 (소셜 4버튼, 카카오 primary)
import { redirect } from "next/navigation";
import { Glass, Spark } from "@/components/ds";
import { LoginButtons } from "@/components/auth/LoginButtons";
import { currentUser, enabledProviders } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(user.nickname ? "/" : "/signup");

  return (
    <Glass style={{ width: 420, maxWidth: "100%", padding: 38, display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
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
        <div className="jm-eyebrow" style={{ justifyContent: "center" }}>
          JUNGLE MARKET
        </div>
        <h1 className="jm-title" style={{ fontSize: 23 }}>
          3초 만에 시작하기
        </h1>
        <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>소셜 계정으로 바로 로그인하세요</div>
      </div>
      <LoginButtons enabled={enabledProviders} />
      <div style={{ textAlign: "center", fontSize: 12.5, color: "var(--text-tertiary)", lineHeight: 1.7 }}>
        시작하면 <span style={{ color: "var(--text-secondary)" }}>이용약관</span>과{" "}
        <span style={{ color: "var(--text-secondary)" }}>개인정보 처리방침</span>에
        <br />
        동의하는 것으로 간주됩니다.
      </div>
    </Glass>
  );
}
