// 게시판 글 상세 — 글래스 패널 본문 + 댓글 (신규 설계)
import { notFound } from "next/navigation";
import { Avatar, Chip, Divider, Eyebrow, Glass, Icon, Pill } from "@/components/ds";
import { CommentComposer } from "@/components/board/CommentSection";
import { DeletePostButton } from "@/components/board/DeletePostButton";
import { currentUser } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { getPost } from "@/lib/queries/posts";

export const dynamic = "force-dynamic";

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [post, user] = await Promise.all([getPost(id), currentUser()]);
  if (!post) notFound();

  const author = post.author.nickname ?? post.author.name ?? "이웃";

  return (
    <div style={{ display: "flex", justifyContent: "center", flex: 1, minHeight: 0 }}>
      <Glass style={{ width: 860, maxWidth: "100%", padding: 34, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Eyebrow>TOWN BOARD</Eyebrow>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {post.tags.map(({ tag }) => (
                <Chip key={tag.id} tone="muted">
                  {tag.name}
                </Chip>
              ))}
            </div>
            <h1 className="jm-title" style={{ fontSize: 24 }}>
              {post.title}
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Pill ghost href="/board">
              <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
                <Icon name="arrow" size={14} color="var(--text-secondary)" />
              </span>
              목록
            </Pill>
            {user?.id === post.authorId && <DeletePostButton postId={post.id} />}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar size={40} label={author[0]} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>{author}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
              {post.author.town ?? "동네 미설정"} · {timeAgo(post.createdAt)}
            </div>
          </div>
        </div>

        <Divider />

        <div style={{ fontSize: 15, lineHeight: 1.8, color: "var(--text-body)", whiteSpace: "pre-wrap" }}>
          {post.content}
        </div>

        <Divider />

        {/* 댓글 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            댓글 <span style={{ color: "var(--accent)" }}>{post.comments.length}</span>
          </div>
          {post.comments.map((c) => {
            const commenter = c.author.nickname ?? c.author.name ?? "이웃";
            return (
              <div key={c.id} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <Avatar size={32} label={commenter[0]} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{commenter}</span>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{timeAgo(c.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)" }}>{c.body}</div>
                </div>
              </div>
            );
          })}
          <CommentComposer postId={post.id} loggedIn={Boolean(user)} />
        </div>
      </Glass>
    </div>
  );
}
