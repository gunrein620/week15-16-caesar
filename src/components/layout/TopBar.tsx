"use client";

// 상단 유틸리티 바 — 브랜드 + 네비 pill + 검색/알림 + 민트 CTA (lib.jsx TopBar 이식)
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Cta, Icon, Spark } from "@/components/ds";

const NAV = [
  { label: "홈", href: "/" },
  { label: "게시판", href: "/board" },
  { label: "채팅", href: "/chat" },
  { label: "내 거래", href: "/deals" },
];

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/products") : pathname.startsWith(href);

  const submitSearch = () => {
    const query = q.trim();
    setSearching(false);
    setQ("");
    router.push(query ? `/?q=${encodeURIComponent(query)}` : "/");
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "0 4px" }}>
      <Link href="/" className="jm-eyebrow" style={{ fontSize: 14, letterSpacing: 3 }}>
        <Spark /> JUNGLE MARKET
      </Link>
      <nav style={{ display: "flex", gap: 4, marginLeft: 14 }}>
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              fontSize: 14,
              padding: "8px 14px",
              borderRadius: 999,
              color: isActive(n.href) ? "var(--text-body)" : "var(--text-secondary)",
              background: isActive(n.href) ? "rgba(255,255,255,0.05)" : "transparent",
            }}
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      {searching ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch();
          }}
          className="jm-pill is-ghost"
          style={{ gap: 8, padding: "6px 8px 6px 16px" }}
        >
          <Icon name="search" size={16} color="var(--text-secondary)" />
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => !q && setSearching(false)}
            placeholder="물건 검색"
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-body)",
              fontFamily: "var(--font-body)",
              fontSize: 14,
              width: 160,
            }}
          />
        </form>
      ) : (
        <button type="button" className="jm-pill is-ghost" style={{ gap: 8 }} onClick={() => setSearching(true)}>
          <Icon name="search" size={16} color="var(--text-secondary)" /> 검색
        </button>
      )}
      <button type="button" className="jm-pill is-ghost" aria-label="알림">
        <Icon name="bell" size={16} color="var(--text-secondary)" />
      </button>
      <Cta href="/products/new">
        <Icon name="plus" size={16} color="var(--on-accent)" /> 판매하기
      </Cta>
    </div>
  );
}
