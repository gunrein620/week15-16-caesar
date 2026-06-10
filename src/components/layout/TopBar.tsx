"use client";

// 상단 유틸리티 바 — 브랜드 + 네비 pill + 검색/알림 + 민트 CTA (lib.jsx TopBar 이식)
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useRef, useState } from "react";
import { Cta, Icon, Spark } from "@/components/ds";
import { NAV, isNavActive } from "./nav";

type Viewer = {
  id: string;
  nickname: string | null;
  name: string | null;
  email: string | null;
} | null;

export function TopBar({ viewer }: { viewer: Viewer }) {
  const pathname = usePathname();
  const router = useRouter();
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const displayName = viewer?.nickname ?? viewer?.name ?? viewer?.email ?? "이웃";

  const submitSearch = () => {
    const query = q.trim();
    setSearching(false);
    setQ("");
    router.push(query ? `/?q=${encodeURIComponent(query)}` : "/");
  };

  return (
    <div className="jm-topbar">
      <Link href="/" className="jm-eyebrow jm-topbar-brand">
        <Spark /> JUNGLE MARKET
      </Link>
      <nav className="jm-topbar-nav">
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
              color: isNavActive(n.href, pathname) ? "var(--text-body)" : "var(--text-secondary)",
              background: isNavActive(n.href, pathname) ? "rgba(255,255,255,0.05)" : "transparent",
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
          className="jm-pill is-ghost jm-topbar-search"
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
            className="jm-topbar-search-input"
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-body)",
              fontFamily: "var(--font-body)",
              fontSize: 14,
            }}
          />
        </form>
      ) : (
        <button type="button" className="jm-pill is-ghost" style={{ gap: 8 }} onClick={() => setSearching(true)}>
          <Icon name="search" size={16} color="var(--text-secondary)" />
          <span className="jm-hide-mobile">검색</span>
        </button>
      )}
      <button type="button" className="jm-pill is-ghost" aria-label="알림">
        <Icon name="bell" size={16} color="var(--text-secondary)" />
      </button>
      {viewer ? (
        <div className="jm-pill is-ghost" style={{ gap: 10, padding: "6px 8px 6px 14px" }}>
          <span
            className="jm-hide-mobile"
            style={{
              maxWidth: 120,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontWeight: 700,
              fontSize: 13.5,
            }}
          >
            {displayName}
          </span>
          <button
            type="button"
            onClick={() => signOut({ redirectTo: "/" })}
            style={{
              border: "1px solid var(--border-card)",
              borderRadius: 999,
              background: "rgba(255,255,255,0.04)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontSize: 12.5,
              fontWeight: 700,
              padding: "5px 9px",
            }}
          >
            로그아웃
          </button>
        </div>
      ) : (
        <Link href="/login" className="jm-pill is-ghost" style={{ gap: 8 }}>
          <Icon name="user" size={16} color="var(--text-secondary)" /> 로그인
        </Link>
      )}
      <Cta href="/products/new" className="jm-hide-mobile">
        <Icon name="plus" size={16} color="var(--on-accent)" /> 판매하기
      </Cta>
    </div>
  );
}
