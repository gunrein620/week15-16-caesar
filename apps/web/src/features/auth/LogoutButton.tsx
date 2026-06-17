"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 로그아웃 버튼.
 * - POST /api/auth/logout 으로 세션을 삭제하고 쿠키를 정리한 뒤 홈으로 이동한다.
 */
export function LogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    setIsLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      // 챗봇 등 클라이언트 상태에 로그아웃을 알린다(대화 초기화용).
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("junglebob:logout"));
      }
      router.push("/");
      router.refresh();
    } catch {
      setIsLoading(false);
    }
  }

  return (
    <button className="nav-auth" disabled={isLoading} onClick={handleLogout} type="button">
      {isLoading ? "로그아웃 중" : "로그아웃"}
    </button>
  );
}
