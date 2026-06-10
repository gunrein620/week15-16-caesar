// 디자인 시스템 프리미티브 — .jm-* 클래스의 얇은 래퍼.
// (번들 components/core/*.jsx + lib.jsx 이식)
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Spark } from "./Spark";

export function Eyebrow({
  children,
  dim,
  icon = true,
  style,
}: {
  children: ReactNode;
  dim?: boolean;
  icon?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div className={"jm-eyebrow" + (dim ? " is-dim" : "")} style={style}>
      {icon && <Spark />}
      {children}
    </div>
  );
}

export function Glass({
  children,
  variant = 1,
  className = "",
  style,
}: {
  children?: ReactNode;
  variant?: 1 | 2;
  className?: string;
  style?: CSSProperties;
}) {
  const base = variant === 1 ? "jm-glass" : "jm-glass-2";
  return (
    <div className={`${base} ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

export function Pill({
  children,
  on,
  ghost,
  href,
  onClick,
  type,
  style,
}: {
  children: ReactNode;
  on?: boolean;
  ghost?: boolean;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  style?: CSSProperties;
}) {
  const cls = "jm-pill" + (on ? " is-on" : "") + (ghost ? " is-ghost" : "");
  if (href) {
    return (
      <Link href={href} className={cls} style={style}>
        {children}
      </Link>
    );
  }
  if (onClick || type) {
    return (
      <button type={type ?? "button"} className={cls} style={style} onClick={onClick}>
        {children}
      </button>
    );
  }
  return (
    <span className={cls} style={style}>
      {children}
    </span>
  );
}

export type ChipTone = "mint" | "warn" | "danger" | "muted";

export function Chip({
  children,
  tone = "mint",
  style,
}: {
  children: ReactNode;
  tone?: ChipTone;
  style?: CSSProperties;
}) {
  return (
    <span className={`jm-chip is-${tone}`} style={style}>
      {children}
    </span>
  );
}

export function Cta({
  children,
  lg,
  block,
  secondary,
  href,
  onClick,
  type,
  disabled,
  style,
}: {
  children: ReactNode;
  lg?: boolean;
  block?: boolean;
  secondary?: boolean;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  style?: CSSProperties;
}) {
  const cls =
    "jm-cta" + (lg ? " is-lg" : "") + (block ? " is-block" : "") + (secondary ? " is-secondary" : "");
  if (href) {
    return (
      <Link href={href} className={cls} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type ?? "button"} className={cls} style={style} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Avatar({
  size = 40,
  label = "U",
  style,
}: {
  size?: number;
  label?: string;
  style?: CSSProperties;
}) {
  return (
    <div className="jm-avatar" style={{ width: size, height: size, fontSize: size * 0.38, ...style }}>
      {label}
    </div>
  );
}

// 줄무늬 사진 플레이스홀더 (모노 캡션)
export function Photo({
  label = "PHOTO",
  radius = 14,
  style,
}: {
  label?: string;
  radius?: number;
  style?: CSSProperties;
}) {
  return (
    <div className="jm-photo" style={{ borderRadius: radius, ...style }}>
      <span>{label}</span>
    </div>
  );
}

export function Divider({ style }: { style?: CSSProperties }) {
  return <hr className="jm-divider" style={style} />;
}
