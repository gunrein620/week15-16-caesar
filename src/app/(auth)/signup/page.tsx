// ⑤ 회원가입 — D안 프로필 설정. 소셜 연결 후 마지막 단계.
import { redirect } from "next/navigation";
import { Eyebrow, Glass } from "@/components/ds";
import { SignupForm } from "@/components/auth/SignupForm";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <Glass style={{ width: 480, maxWidth: "100%", padding: 38, display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <Eyebrow>SIGN UP</Eyebrow>
        <h1 className="jm-title" style={{ fontSize: 24, marginTop: 10 }}>
          프로필 설정
        </h1>
        <div style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 6 }}>
          계정이 연결됐어요. 마지막 단계예요.
        </div>
      </div>
      <SignupForm initialNickname={user.nickname ?? ""} initialTown={user.town ?? ""} />
    </Glass>
  );
}
