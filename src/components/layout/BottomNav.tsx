"use client";

// 모바일 하단 탭바 — 768px 이하에서만 표시 (responsive.css .jm-bottomnav).
// 중앙의 민트 원형 버튼이 판매하기 진입점 (데스크톱 TopBar CTA 대체).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ds";
import { NAV, isNavActive } from "./nav";

export function BottomNav() {
  const pathname = usePathname();

  const tab = (n: (typeof NAV)[number]) => (
    <Link
      key={n.href}
      href={n.href}
      className={"jm-bottomnav-item" + (isNavActive(n.href, pathname) ? " is-active" : "")}
    >
      <Icon name={n.icon} size={20} />
      {n.label}
    </Link>
  );

  return (
    <nav className="jm-bottomnav" aria-label="모바일 메뉴">
      {NAV.slice(0, 2).map(tab)}
      <Link href="/products/new" className="jm-bottomnav-sell" aria-label="판매하기">
        <Icon name="plus" size={20} />
      </Link>
      {NAV.slice(2).map(tab)}
    </nav>
  );
}
