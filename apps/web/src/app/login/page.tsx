import Link from "next/link";
import { LoginForm } from "@/features/auth/LoginForm";

export default function LoginPage() {
  return (
    <section className="narrow-page">
      <div className="page-header compact">
        <p className="eyebrow">정글밥 계정</p>
        <h1>로그인</h1>
      </div>
      <LoginForm />
      <p className="helper-text">
        아직 계정이 없다면 <Link href="/signup">회원가입</Link>
      </p>
    </section>
  );
}
