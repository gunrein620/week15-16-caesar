import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "정글 간식 재판소",
  description: "크래프톤 정글 학우들의 간식 사유 게시판",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/snack-court-icon.png", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/brand/snack-court-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
