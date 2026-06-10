import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Space Grotesk = 영문 eyebrow/모노 캡션, Noto Sans KR = 한국어 UI 전반
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-en",
});

const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-kr",
});

export const metadata: Metadata = {
  title: "정글마켓 — 우리 동네 중고 마켓",
  description: "우리 동네에서 바로 거래하는 중고 마켓. 근처 물건을 보고 채팅으로 바로 약속해요.",
  appleWebApp: { capable: true, title: "정글마켓", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // iOS env(safe-area-inset-*) 활성화
  themeColor: "#090b0c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${spaceGrotesk.variable} ${notoSansKr.variable}`}>{children}</body>
    </html>
  );
}
