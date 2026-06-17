"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { navigateAfterAuth } from "./auth-navigation";
import { loginWithDemoAccount } from "./demo-account";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
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

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    setIsSubmitting(false);

    if (!response.ok) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
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
        <span>비밀번호</span>
        <input
          autoComplete="current-password"
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
        {isSubmitting ? "로그인 중" : "로그인"}
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
