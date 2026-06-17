import Link from "next/link";
import { SignupForm } from "@/features/auth/SignupForm";

export default function SignupPage() {
  return (
    <section className="narrow-page">
      <div className="page-header compact">
        <p className="eyebrow">정글밥 시작하기</p>
        <h1>회원가입</h1>
      </div>
      <SignupForm />
      <p className="helper-text">
        이미 계정이 있다면 <Link href="/login">로그인</Link>
      </p>
    </section>
  );
}
