// 디자인 시스템의 캐노니컬 라인 아이콘 세트 (lib.jsx 이식).
// 18×18 그리드, 1.7px 스트로크, 라운드 캡 — currentColor 상속.
import type { ReactNode } from "react";

export type IconName =
  | "search"
  | "plus"
  | "chat"
  | "heart"
  | "pin"
  | "bell"
  | "arrow"
  | "send"
  | "camera"
  | "grid"
  | "check"
  | "clock"
  | "won";

const PATHS: Record<IconName, ReactNode> = {
  search: (
    <>
      <circle cx="7.5" cy="7.5" r="5" />
      <path d="M11.5 11.5L15.5 15.5" />
    </>
  ),
  plus: <path d="M9 3.5v11M3.5 9h11" />,
  chat: (
    <path d="M3 5.5A1.5 1.5 0 014.5 4h9A1.5 1.5 0 0115 5.5v6A1.5 1.5 0 0113.5 13H7l-3 2.5V13H4.5A1.5 1.5 0 013 11.5z" />
  ),
  heart: (
    <path d="M9 14.5S3 11 3 6.8A2.8 2.8 0 019 5.2 2.8 2.8 0 0115 6.8C15 11 9 14.5 9 14.5z" />
  ),
  pin: (
    <>
      <path d="M9 15.5s5-4.2 5-8.2A5 5 0 109 13" />
      <circle cx="9" cy="7" r="1.8" />
    </>
  ),
  bell: (
    <>
      <path d="M5 8a4 4 0 018 0c0 4 1.5 5 1.5 5h-11S5 12 5 8z" />
      <path d="M7.5 15.5a1.6 1.6 0 003 0" />
    </>
  ),
  arrow: <path d="M4 9h10M10 5l4 4-4 4" />,
  send: <path d="M15.5 2.5L8 10M15.5 2.5l-5 13-2.5-5.5L2.5 7.5z" />,
  camera: (
    <>
      <path d="M3 6.5A1.5 1.5 0 014.5 5h1L6.5 3.5h5L12.5 5h1A1.5 1.5 0 0115 6.5v7A1.5 1.5 0 0113.5 15h-9A1.5 1.5 0 013 13.5z" />
      <circle cx="9" cy="9.5" r="2.5" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="5" height="5" rx="1.2" />
      <rect x="10" y="3" width="5" height="5" rx="1.2" />
      <rect x="3" y="10" width="5" height="5" rx="1.2" />
      <rect x="10" y="10" width="5" height="5" rx="1.2" />
    </>
  ),
  check: <path d="M3.5 9.5l3.5 3.5 7.5-8" />,
  clock: (
    <>
      <circle cx="9" cy="9" r="6.5" />
      <path d="M9 5.5V9l2.5 1.5" />
    </>
  ),
  won: <path d="M3.5 5l2 8 2.5-6 2.5 6 2-8M3 8h12" />,
};

export function Icon({
  name,
  size = 18,
  color = "currentColor",
  stroke = 1.7,
}: {
  name: IconName;
  size?: number;
  color?: string;
  stroke?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
