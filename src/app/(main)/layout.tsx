import { TopBar } from "@/components/layout/TopBar";
import { currentUser } from "@/lib/auth";

// 데스크톱 보드 셸 — 와이어프레임 .jb-art의 패딩/간격(26px / 18px)을 그대로 따른다.
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
    <div
      style={{
        maxWidth: 1560,
        margin: "0 auto",
        minHeight: "100vh",
        padding: 26,
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <TopBar viewer={viewer} />
      {children}
    </div>
  );
}
