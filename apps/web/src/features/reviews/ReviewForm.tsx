"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { StarRating } from "./StarRating";

type ReviewListResponse = {
  reviews: Array<{ menuNames: string[] }>;
};

type ReviewFormValue = {
  title: string;
  content: string;
  rating: string;
  menuNames: string;
  tags: string;
};

type ReviewFormProps = {
  initialValue?: ReviewFormValue;
  mode: "create" | "edit";
  reviewId?: string;
  onSaved?: () => void;
};

const EMPTY_VALUE: ReviewFormValue = {
  title: "",
  content: "",
  rating: "",
  menuNames: "",
  tags: ""
};

export function ReviewForm({ initialValue, mode, onSaved, reviewId }: ReviewFormProps) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue ?? EMPTY_VALUE);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [menuSuggestions, setMenuSuggestions] = useState<string[]>([]);

  // 작성 모드에서 ?menu=... 쿼리로 들어오면 메뉴명을 미리 채운다(식단 화면에서 바로 후기쓰기).
  useEffect(() => {
    if (mode !== "create" || typeof window === "undefined") {
      return;
    }
    const menuParam = new URLSearchParams(window.location.search).get("menu");
    if (menuParam) {
      setValue((current) => (current.menuNames ? current : { ...current, menuNames: menuParam }));
    }
  }, [mode]);

  // 기존 후기에서 자주 등장한 메뉴명을 자동완성 후보로 수집
  useEffect(() => {
    let active = true;

    async function loadMenuSuggestions() {
      try {
        const response = await fetch("/api/reviews?pageSize=30");
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as ReviewListResponse;
        const counts = new Map<string, number>();
        for (const review of body.reviews) {
          for (const name of review.menuNames) {
            counts.set(name, (counts.get(name) ?? 0) + 1);
          }
        }
        const ranked = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([name]) => name);

        if (active) {
          setMenuSuggestions(ranked);
        }
      } catch {
        // 자동완성 후보 로드 실패는 무시 (선택 기능)
      }
    }

    loadMenuSuggestions();
    return () => {
      active = false;
    };
  }, []);

  const selectedMenus = useMemo(
    () =>
      value.menuNames
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    [value.menuNames]
  );

  function toggleMenu(name: string) {
    setValue((current) => {
      const items = current.menuNames
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const next = items.includes(name) ? items.filter((item) => item !== name) : [...items, name];
      return { ...current, menuNames: next.join(", ") };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const response = await fetch(mode === "create" ? "/api/reviews" : `/api/reviews/${reviewId}`, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: value.title,
        content: value.content,
        rating: value.rating,
        menuArchiveId: null,
        imageUrl: null,
        menuNames: value.menuNames,
        tags: value.tags
      })
    });

    setIsSubmitting(false);

    if (response.status === 401) {
      setError("로그인이 필요합니다.");
      return;
    }

    if (!response.ok) {
      setError("후기를 저장하지 못했습니다.");
      return;
    }

    const body = (await response.json()) as { review: { id: string } };

    if (mode === "create") {
      router.push(`/reviews/${body.review.id}`);
      router.refresh();
      return;
    }

    onSaved?.();
    router.refresh();
  }

  return (
    <form className="form-card wide" onSubmit={handleSubmit}>
      <label className="field">
        <span>제목</span>
        <input
          name="title"
          onChange={(event) => setValue((current) => ({ ...current, title: event.target.value }))}
          required
          type="text"
          value={value.title}
        />
      </label>
      <label className="field">
        <span>내용</span>
        <textarea
          name="content"
          onChange={(event) => setValue((current) => ({ ...current, content: event.target.value }))}
          required
          rows={6}
          value={value.content}
        />
      </label>
      <div className="field">
        <span>평점</span>
        <StarRating
          onChange={(next) =>
            setValue((current) => ({
              ...current,
              rating: current.rating === String(next) ? "" : String(next)
            }))
          }
          size="lg"
          value={value.rating ? Number(value.rating) : null}
        />
      </div>
      <div className="field">
        <span>메뉴명</span>
        <input
          list="menu-name-suggestions"
          name="menuNames"
          onChange={(event) => setValue((current) => ({ ...current, menuNames: event.target.value }))}
          placeholder="제육볶음, 잡곡밥"
          type="text"
          value={value.menuNames}
        />
        <datalist id="menu-name-suggestions">
          {menuSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {menuSuggestions.length > 0 ? (
          <div className="quick-chips">
            {menuSuggestions.map((name) => {
              const active = selectedMenus.includes(name);
              return (
                <button
                  className={`chip-suggestion ${active ? "on" : ""}`}
                  key={name}
                  onClick={() => toggleMenu(name)}
                  type="button"
                >
                  {active ? "✓ " : "+ "}
                  {name}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <label className="field">
        <span>태그</span>
        <input
          name="tags"
          onChange={(event) => setValue((current) => ({ ...current, tags: event.target.value }))}
          placeholder="매움, 점심, 추천"
          type="text"
          value={value.tags}
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="button primary" disabled={isSubmitting} type="submit">
        {isSubmitting ? "저장 중" : mode === "create" ? "작성" : "수정"}
      </button>
    </form>
  );
}
