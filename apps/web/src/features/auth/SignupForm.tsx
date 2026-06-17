"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { navigateAfterAuth } from "./auth-navigation";
import { loginWithDemoAccount } from "./demo-account";

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  async function handleDemoLogin() {
    setError("");
    setIsDemoLoading(true);
    const ok = await loginWithDemoAccount();
    setIsDemoLoading(false);

    if (!ok) {
      setError("데모 계정 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    navigateAfterAuth(router);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const signupResponse = await fetch("/api/auth/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, name, password })
    });

    if (!signupResponse.ok) {
      setIsSubmitting(false);
      const body = (await signupResponse.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "회원가입 처리 중 오류가 발생했습니다.");
      return;
    }

    const loginResponse = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    setIsSubmitting(false);

    if (!loginResponse.ok) {
      router.push("/login");
      return;
    }

    navigateAfterAuth(router);
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <label className="field">
        <span>이메일</span>
        <input
          autoComplete="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <label className="field">
        <span>이름</span>
        <input
          autoComplete="name"
          name="name"
          onChange={(event) => setName(event.target.value)}
          required
          type="text"
          value={name}
        />
      </label>
      <label className="field">
        <span>비밀번호</span>
        <input
          autoComplete="new-password"
          minLength={8}
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="button primary" disabled={isSubmitting || isDemoLoading} type="submit">
        {isSubmitting ? "가입 중" : "회원가입"}
      </button>
      <div className="auth-divider">
        <span>또는</span>
      </div>
      <button
        className="button demo-button"
        disabled={isSubmitting || isDemoLoading}
        onClick={handleDemoLogin}
        type="button"
      >
        {isDemoLoading ? "데모 준비 중" : "🌿 데모 계정으로 둘러보기"}
      </button>
    </form>
  );
}
