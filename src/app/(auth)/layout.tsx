// 인증 화면 셸 — 네비 없이 화면 중앙 정렬 (auth.jsx A/D안)
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="jm-auth-shell">{children}</div>
  );
}
