"use client";

// 게시판 글쓰기 폼 — 제목 + 태그 선택 + 내용 (신규 설계, 등록 화면의 폼 문법 재사용)
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Cta, Eyebrow, Field, Glass, TextareaField } from "@/components/ds";

export function PostForm({ tags }: { tags: string[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleTag = (t: string) =>
    setSelected((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const submit = () => {
    setError(null);
    if (!title.trim()) return setError("제목을 입력해 주세요.");
    if (!content.trim()) return setError("내용을 입력해 주세요.");
    startTransition(async () => {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: content.trim(), tags: selected }),
      });
      if (res.status === 401) return router.push("/login");
      if (!res.ok) return setError("등록에 실패했어요. 잠시 후 다시 시도해 주세요.");
      const post = await res.json();
      router.push(`/board/${post.id}`);
      router.refresh();
    });
  };

  return (
    <div style={{ flex: 1, display: "flex", justifyContent: "center", minHeight: 0 }}>
      <Glass style={{ width: 720, maxWidth: "100%", padding: 34, display: "flex", flexDirection: "column", gap: 22 }}>
        <div>
          <Eyebrow>NEW POST</Eyebrow>
          <h1 className="jm-title" style={{ fontSize: 26, marginTop: 10 }}>
            동네 이야기 쓰기
          </h1>
          <div style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 6 }}>
            우리 동네 이웃들과 나누고 싶은 이야기를 적어 주세요.
          </div>
        </div>
        <Field
          label="제목"
          placeholder="예) 역삼역 근처 자전거 수리점 추천해 주세요"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="jm-field">
          <label>태그</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                className={"jm-pill" + (selected.includes(t) ? " is-on" : "")}
                onClick={() => toggleTag(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <TextareaField
          label="내용"
          placeholder="이웃에게 전하고 싶은 내용을 적어 주세요."
          rows={8}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        {error && <div style={{ color: "var(--jm-danger)", fontSize: 13.5 }}>{error}</div>}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <Cta secondary href="/board">
            취소
          </Cta>
          <Cta onClick={submit} disabled={pending}>
            작성 완료
          </Cta>
        </div>
      </Glass>
    </div>
  );
}
