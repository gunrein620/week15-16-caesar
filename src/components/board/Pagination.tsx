// pill 페이지네이션 — 이전 / 페이지 번호 / 다음
import { Icon, Pill } from "@/components/ds";

export function Pagination({
  page,
  totalPages,
  makeHref,
}: {
  page: number;
  totalPages: number;
  makeHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, paddingTop: 8 }}>
      {page > 1 && (
        <Pill ghost href={makeHref(page - 1)}>
          <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
            <Icon name="arrow" size={14} color="var(--text-secondary)" />
          </span>
          이전
        </Pill>
      )}
      {pages.map((p) => (
        <Pill key={p} on={p === page} href={makeHref(p)} style={{ padding: "8px 15px" }}>
          {p}
        </Pill>
      ))}
      {page < totalPages && (
        <Pill ghost href={makeHref(page + 1)}>
          다음 <Icon name="arrow" size={14} color="var(--text-secondary)" />
        </Pill>
      )}
    </div>
  );
}
