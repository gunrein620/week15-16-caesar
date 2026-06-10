// 인증 화면 셸 — 네비 없이 화면 중앙 정렬 (auth.jsx A/D안)
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 30,
      }}
    >
      {children}
    </div>
  );
}
