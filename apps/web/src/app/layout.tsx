import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { AgentChatWidget } from "@/components/AgentChatWidget";
import { getCurrentUserFromCookies } from "@/features/auth/current-user";
import { LogoutButton } from "@/features/auth/LogoutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "정글밥",
  description: "정글러를 위한 AI 식단 후기 게시판"
};

function initial(name: string): string {
  return name.trim().slice(0, 1) || "정";
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUserFromCookies();

  return (
    <html lang="ko">
      <body>
        <div className="shell">
          <header className="topbar">
            <Link className="brand" href="/">
              <BrandLogo />
            </Link>

            <nav className="topnav" aria-label="주요 메뉴">
              <Link className="nav-link" href="/menus">
                식단
              </Link>
              <Link className="nav-link" href="/reviews">
                후기
              </Link>
              {user ? (
                <Link className="nav-link" href="/profile/food">
                  음식 프로필
                </Link>
              ) : null}
            </nav>

            <div className="topbar-actions">
              <Link className="nav-cta" href="/ai/recommend">
                AI 메뉴 진단
              </Link>
              {user ? (
                <>
                  <Link className="nav-avatar" href="/profile/food" aria-label={`${user.name}님 프로필`}>
                    {initial(user.name)}
                  </Link>
                  <LogoutButton />
                </>
              ) : (
                <>
                  <Link className="nav-link" href="/login">
                    로그인
                  </Link>
                  <Link className="nav-auth" href="/signup">
                    회원가입
                  </Link>
                </>
              )}
            </div>
          </header>
          <main className="main">{children}</main>
        </div>
        <AgentChatWidget />
      </body>
    </html>
  );
}
