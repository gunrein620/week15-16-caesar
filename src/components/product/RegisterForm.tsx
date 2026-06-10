"use client";

// ③ 상품 등록 폼 — B안 (사진 보드 + 폼). 사진 업로드 파이프라인은 추후 — 웰은 시각 요소.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Cta, Eyebrow, Field, Glass, Icon, Photo, TextareaField } from "@/components/ds";
import type { Category } from "@prisma/client";

export function RegisterForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id);
  const [price, setPrice] = useState("");
  const [share, setShare] = useState(false);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    if (!title.trim()) return setError("제목을 입력해 주세요.");
    const priceNum = share ? 0 : Number(price.replaceAll(",", ""));
    if (!share && (!price || Number.isNaN(priceNum) || priceNum < 0)) {
      return setError("가격을 숫자로 입력해 주세요.");
    }
    startTransition(async () => {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), categoryId, price: priceNum, description }),
      });
      if (res.status === 401) return router.push("/login");
      if (!res.ok) return setError("등록에 실패했어요. 잠시 후 다시 시도해 주세요.");
      const product = await res.json();
      router.push(`/products/${product.id}`);
      router.refresh();
    });
  };

  return (
    <div className="jm-grid-register">
      {/* 사진 보드 */}
      <Glass style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <Eyebrow>PHOTOS</Eyebrow>
        <div
          className="jm-glass-2 jm-photo-well"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            borderStyle: "dashed",
            borderColor: "var(--border-strong)",
          }}
        >
          <Icon name="camera" size={34} color="var(--accent)" />
          <div style={{ fontWeight: 700, fontSize: 15 }}>사진을 끌어다 놓거나 클릭해서 추가</div>
          <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>최대 10장 · 첫 사진이 대표 이미지</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {[1, 2, 3, 4].map((i) => (
            <Photo key={i} label={i === 1 ? "대표" : ""} radius={12} style={{ flex: 1, height: 72 }} />
          ))}
        </div>
      </Glass>

      {/* 폼 */}
      <Glass className="jm-register-form">
        <div>
          <Eyebrow>NEW LISTING</Eyebrow>
          <h1 className="jm-title" style={{ fontSize: 24, marginTop: 8 }}>
            물건 정보
          </h1>
        </div>
        <Field
          label="제목"
          placeholder="예) 무인양품 4단 우드 선반"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="jm-field">
          <label>카테고리</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={"jm-pill" + (categoryId === c.id ? " is-on" : "")}
                onClick={() => setCategoryId(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="jm-field">
          <label>가격</label>
          <div style={{ display: "flex", gap: 10 }}>
            <div className="jm-input" style={{ flex: 1, gap: 8, padding: "0 18px" }}>
              <input
                value={share ? "" : price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={share ? "나눔으로 올려요" : "가격을 입력해 주세요"}
                disabled={share}
                inputMode="numeric"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--text-body)",
                  fontSize: 15,
                }}
              />
              <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>원</span>
            </div>
            <button
              type="button"
              className={"jm-pill" + (share ? " is-on" : "")}
              onClick={() => setShare((s) => !s)}
            >
              <Icon name="check" size={14} color={share ? "var(--on-accent)" : "var(--text-secondary)"} />{" "}
              나눔할래요
            </button>
          </div>
        </div>
        <TextareaField
          label="자세한 설명"
          placeholder="상품 상태와 거래 방법을 적어 주세요."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && <div style={{ color: "var(--jm-danger)", fontSize: 13.5 }}>{error}</div>}
        <Cta block lg onClick={submit} disabled={pending}>
          작성 완료
        </Cta>
      </Glass>
    </div>
  );
}
