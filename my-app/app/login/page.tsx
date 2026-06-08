"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin() {
    await signIn("credentials", {
      email,
      password,
      callbackUrl: "/",
    });
  }

  return (
    <main className="max-w-sm mx-auto p-8 mt-20">
      <h1 className="text-2xl font-bold mb-6">로그인</h1>
      <div className="flex flex-col gap-3">
        <input
          className="border p-2 rounded"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="border p-2 rounded"
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          className="bg-black text-white p-2 rounded"
          onClick={handleLogin}
        >
          로그인
        </button>
      </div>
    </main>
  );
}