import { BottomNav } from "@/components/layout/BottomNav";
import { TopBar } from "@/components/layout/TopBar";
import { currentUser } from "@/lib/auth";

// 보드 셸 — 데스크톱은 와이어프레임 .jb-art의 패딩/간격(26px / 18px), 모바일은 responsive.css .jm-shell.
export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const viewer = user
    ? {
        id: user.id,
        nickname: user.nickname,
        name: user.name,
        email: user.email,
      }
    : null;

  return (
    <div className="jm-shell">
      <TopBar viewer={viewer} />
      {children}
      <BottomNav />
    </div>
  );
}
