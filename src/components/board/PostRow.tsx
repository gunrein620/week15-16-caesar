// 게시판 글 행 — 제목 + 본문 미리보기 + 태그 칩 + 메타 (신규 설계, 보드 문법 준수)
import Link from "next/link";
import { Chip } from "@/components/ds";
import { timeAgo } from "@/lib/format";
import type { PostListItem } from "@/lib/queries/posts";

export function PostRow({ post }: { post: PostListItem }) {
  const author = post.author.nickname ?? post.author.name ?? "이웃";
  return (
    <Link href={`/board/${post.id}`} style={{ display: "block" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: "14px 4px",
          borderBottom: "1px solid var(--border-card)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: 15,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {post.title}
          </span>
          {post.tags.map(({ tag }) => (
            <Chip key={tag.id} tone="muted">
              {tag.name}
            </Chip>
          ))}
        </div>
        <div
          style={{
            fontSize: 13.5,
            color: "var(--text-secondary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {post.content}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "var(--text-tertiary)" }}>
          <span>{author}</span>
          <span>·</span>
          <span>{timeAgo(post.createdAt)}</span>
          <span>·</span>
          <span style={{ color: post._count.comments > 0 ? "var(--accent)" : "var(--text-tertiary)" }}>
            댓글 {post._count.comments}
          </span>
        </div>
      </div>
    </Link>
  );
}
