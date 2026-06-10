// 게시판 (동네 생활) — 디자인 번들에 없는 화면을 보드 문법으로 신규 설계.
// 좌: TOWN BOARD 글 목록(검색·태그 필터·페이징) / 우: 인기 태그 레일 + 글쓰기.
import { Chip, Cta, Eyebrow, Glass, Icon, Pill } from "@/components/ds";
import { Pagination } from "@/components/board/Pagination";
import { PostRow } from "@/components/board/PostRow";
import { listPopularTags, listPosts } from "@/lib/queries/posts";

export const dynamic = "force-dynamic";

function boardHref(opts: { q?: string; tag?: string; page?: number }) {
  const params = new URLSearchParams();
  if (opts.q) params.set("q", opts.q);
  if (opts.tag) params.set("tag", opts.tag);
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  const qs = params.toString();
  return qs ? `/board?${qs}` : "/board";
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; page?: string }>;
}) {
  const { q, tag, page: pageParam } = await searchParams;
  const page = Number(pageParam) || 1;
  const [{ posts, total, totalPages }, tags] = await Promise.all([
    listPosts({ q, tag, page }),
    listPopularTags(),
  ]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.6fr", gap: 18, flex: 1, minHeight: 0 }}>
      {/* 글 목록 */}
      <Glass style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <Eyebrow>TOWN BOARD</Eyebrow>
            <h1 className="jm-title" style={{ fontSize: 21, marginTop: 8 }}>
              {q ? `"${q}" 검색 결과` : "동네 생활"}
            </h1>
          </div>
          <Cta href="/board/new">
            <Icon name="plus" size={16} color="var(--on-accent)" /> 글쓰기
          </Cta>
        </div>

        {/* 검색 — GET 폼이라 JS 없이도 동작 */}
        <form action="/board" method="get" style={{ display: "flex", gap: 10 }}>
          {tag && <input type="hidden" name="tag" value={tag} />}
          <div className="jm-input" style={{ flex: 1, gap: 10, padding: "0 18px" }}>
            <Icon name="search" size={16} color="var(--text-tertiary)" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="글 제목, 내용 검색"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--text-body)",
                fontSize: 15,
              }}
            />
          </div>
        </form>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Pill on={!tag} href={boardHref({ q })}>
            전체
          </Pill>
          {tags.map((t) => (
            <Pill key={t.id} on={tag === t.name} href={boardHref({ q, tag: t.name })}>
              {t.name}
            </Pill>
          ))}
        </div>

        <div style={{ flex: 1 }}>
          {posts.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: 14 }}>
              {q ? "검색 결과가 없어요" : "아직 글이 없어요. 첫 글을 올려 보세요."}
            </div>
          ) : (
            posts.map((p) => <PostRow key={p.id} post={p} />)
          )}
        </div>
        <Pagination page={page} totalPages={totalPages} makeHref={(p) => boardHref({ q, tag, page: p })} />
      </Glass>

      {/* 우측 레일 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18, minHeight: 0 }}>
        <Glass style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          <Eyebrow>POPULAR TAGS</Eyebrow>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {tags.map((t) => (
              <Pill key={t.id} ghost href={boardHref({ tag: t.name })} style={{ gap: 8 }}>
                {t.name}
                <span className="jm-mono" style={{ fontSize: 11 }}>
                  {t._count.posts}
                </span>
              </Pill>
            ))}
          </div>
        </Glass>
        <Glass style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <Eyebrow dim icon={false}>
            BOARD INFO
          </Eyebrow>
          <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.5 }}>
            우리 동네 소식, 질문, 나눔을
            <br />
            가볍게 나누는 공간이에요
          </div>
          <div style={{ fontSize: 13, color: "var(--text-tertiary)", lineHeight: 1.7 }}>
            글 {total}개가 올라와 있어요.
            <br />
            서로 배려하는 말로 써 주세요.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <Chip tone="mint">
              <span className="jm-dot" style={{ width: 6, height: 6 }} /> 오늘도 활발해요
            </Chip>
          </div>
        </Glass>
      </div>
    </div>
  );
}
