// 브랜드 마크 — 4포인트 스파크 글리프
export function Spark({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 1.5l1.3 3.6L12 6.4 8.3 7.8 7 11.5 5.7 7.8 2 6.4l3.7-1.3z" />
    </svg>
  );
}
