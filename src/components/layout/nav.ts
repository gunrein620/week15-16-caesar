// 네비 항목 정의 — TopBar(데스크톱)와 BottomNav(모바일)가 공유한다.
import type { IconName } from "@/components/ds";

export const NAV: { label: string; href: string; icon: IconName }[] = [
  { label: "홈", href: "/", icon: "home" },
  { label: "게시판", href: "/board", icon: "board" },
  { label: "채팅", href: "/chat", icon: "chat" },
  { label: "내 거래", href: "/deals", icon: "won" },
];

// 홈 탭은 상품 상세/등록(/products*)에서도 활성으로 취급한다.
export const isNavActive = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" || pathname.startsWith("/products") : pathname.startsWith(href);
