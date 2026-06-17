"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useState } from "react";
import type { FoodPreferenceData, SpicyToleranceValue } from "./profile";
import { addChips, removeChip, SPICY_LEVELS } from "./chips";
import { buildAgentRecommendation, type RecommendationLevelValue } from "@/features/agent/recommendation";
import type { MenuDay, MenuDayRow } from "@/features/menus/menu-day";

const PREVIEW_LEVEL: Record<RecommendationLevelValue, { label: string; variant: string }> = {
  GOOD: { label: "GOOD · 괜찮아요", variant: "good" },
  CAUTION: { label: "CAUTION · 주의", variant: "warn" },
  AVOID: { label: "AVOID · 피하세요", variant: "danger" }
};

const SPICY_LABEL: Record<SpicyToleranceValue, string> = {
  NONE: "안 먹음",
  LOW: "조금만",
  MEDIUM: "보통",
  HIGH: "좋아함"
};

const COMMON_ALLERGIES = ["새우", "게", "땅콩", "견과류", "우유", "계란", "메밀", "복숭아", "고등어", "오징어"];
const COMMON_FAVORITES = ["제육볶음", "닭갈비", "돈까스", "불고기", "치킨", "김치찌개", "카레", "비빔밥"];
const COMMON_DISLIKES = ["오이", "가지", "당근", "콩", "고수", "깻잎", "버섯", "미나리"];

function toggleKeyword(list: string[], keyword: string): string[] {
  const exists = list.some(
    (chip) => chip.toLocaleLowerCase("ko-KR") === keyword.toLocaleLowerCase("ko-KR")
  );

  return exists ? removeChip(list, keyword) : addChips(list, keyword);
}

type QuickKeywordsProps = {
  label: string;
  keywords: string[];
  selected: string[];
  onToggle: (keyword: string) => void;
};

function QuickKeywords({ label, keywords, selected, onToggle }: QuickKeywordsProps) {
  return (
    <div className="quick-add">
      <span className="quick-add-label">{label}</span>
      {keywords.map((keyword) => {
        const isActive = selected.some(
          (chip) => chip.toLocaleLowerCase("ko-KR") === keyword.toLocaleLowerCase("ko-KR")
        );

        return (
          <button
            key={keyword}
            type="button"
            className={`quick-add-chip${isActive ? " active" : ""}`}
            aria-pressed={isActive}
            onClick={() => onToggle(keyword)}
            style={
              isActive
                ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }
                : undefined
            }
          >
            {isActive ? "✓ " : "+ "}
            {keyword}
          </button>
        );
      })}
    </div>
  );
}

type ChipFieldProps = {
  label: string;
  hint: string;
  chips: string[];
  placeholder: string;
  onAdd: (raw: string) => void;
  onRemove: (chip: string) => void;
};

function ChipField({ label, hint, chips, placeholder, onAdd, onRemove }: ChipFieldProps) {
  const [draft, setDraft] = useState("");

  function commit() {
    if (draft.trim()) {
      onAdd(draft);
      setDraft("");
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.key === "Enter" || event.key === ",") && !event.nativeEvent.isComposing) {
      event.preventDefault();
      commit();
    }
  }

  return (
    <div className="chip-field">
      <span className="chip-field-label">{label}</span>
      <span className="chip-field-hint">{hint}</span>
      <div className="chip-input-box">
        {chips.map((chip) => (
          <span key={chip} className="input-chip">
            {chip}
            <button type="button" aria-label={`${chip} 삭제`} onClick={() => onRemove(chip)}>
              ✕
            </button>
          </span>
        ))}
        <input
          value={draft}
          placeholder={chips.length === 0 ? placeholder : ""}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          aria-label={label}
        />
      </div>
    </div>
  );
}

export function FoodProfileForm() {
  const router = useRouter();
  const [allergyFoods, setAllergyFoods] = useState<string[]>([]);
  const [favoriteFoods, setFavoriteFoods] = useState<string[]>([]);
  const [dislikedFoods, setDislikedFoods] = useState<string[]>([]);
  const [spicyTolerance, setSpicyTolerance] = useState<SpicyToleranceValue>("MEDIUM");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [todayMeal, setTodayMeal] = useState<{ meal: MenuDayRow; label: string } | null>(null);

  // 오늘 식단(점심 우선, 없으면 저녁)을 불러와 설정 미리보기에 쓴다.
  useEffect(() => {
    let active = true;

    async function loadTodayMeal() {
      try {
        const response = await fetch("/api/menus");
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as { menuDay: MenuDay };
        const lunch = body.menuDay.meals.lunch;
        const dinner = body.menuDay.meals.dinner;
        const picked = lunch ?? dinner;
        if (active && picked) {
          setTodayMeal({ meal: picked, label: lunch ? "점심" : "저녁" });
        }
      } catch {
        // 미리보기는 선택 기능 — 실패 시 그냥 숨김
      }
    }

    loadTodayMeal();
    return () => {
      active = false;
    };
  }, []);

  // 현재 칩 설정 기준으로 오늘 메뉴 추천 결과를 즉시 계산한다.
  const preview = useMemo(() => {
    if (!todayMeal) {
      return null;
    }
    const recommendation = buildAgentRecommendation({
      question: "",
      selectedMeal: todayMeal.meal,
      preference: { allergyFoods, favoriteFoods, dislikedFoods, spicyTolerance },
      ragResults: []
    });
    return { level: recommendation.recommendationLevel, message: recommendation.finalMessage };
  }, [todayMeal, allergyFoods, favoriteFoods, dislikedFoods, spicyTolerance]);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      const response = await fetch("/api/profile/food");

      if (!isMounted) {
        return;
      }

      if (response.status === 401) {
        setNeedsLogin(true);
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        setError("음식 프로필을 불러오지 못했습니다.");
        setIsLoading(false);
        return;
      }

      const body = (await response.json()) as { preference: FoodPreferenceData };
      setAllergyFoods(body.preference.allergyFoods);
      setFavoriteFoods(body.preference.favoriteFoods);
      setDislikedFoods(body.preference.dislikedFoods);
      setSpicyTolerance(body.preference.spicyTolerance);
      setIsLoading(false);
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setError("");

    const response = await fetch("/api/profile/food", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allergyFoods, favoriteFoods, dislikedFoods, spicyTolerance })
    });

    if (response.status === 401) {
      setNeedsLogin(true);
      return;
    }

    if (!response.ok) {
      setError("음식 프로필을 저장하지 못했습니다.");
      return;
    }

    const body = (await response.json()) as { preference: FoodPreferenceData };
    setAllergyFoods(body.preference.allergyFoods);
    setFavoriteFoods(body.preference.favoriteFoods);
    setDislikedFoods(body.preference.dislikedFoods);
    setSpicyTolerance(body.preference.spicyTolerance);
    setStatus("저장되었습니다. 메인으로 이동할게요…");

    // 저장 성공 후 메인 페이지로 이동
    router.push("/");
    router.refresh();
  }

  if (isLoading) {
    return <p className="helper-text">불러오는 중</p>;
  }

  if (needsLogin) {
    return (
      <div className="form-card">
        <p className="helper-text">로그인이 필요합니다.</p>
        <Link className="button primary" href="/login">
          로그인
        </Link>
      </div>
    );
  }

  const spicyIndex = SPICY_LEVELS.indexOf(spicyTolerance);

  return (
    <form className="form-card wide profile-form" onSubmit={handleSubmit}>
      {preview && todayMeal ? (
        <div className={`profile-preview profile-preview-${PREVIEW_LEVEL[preview.level].variant}`}>
          <div className="profile-preview-head">
            <span className="profile-preview-eyebrow">지금 설정 기준, 오늘 {todayMeal.label}은</span>
            <span className={`level-chip level-chip-${PREVIEW_LEVEL[preview.level].variant}`}>
              {PREVIEW_LEVEL[preview.level].label}
            </span>
          </div>
          <p className="profile-preview-message">{preview.message}</p>
        </div>
      ) : null}

      <ChipField
        label="알레르기 음식"
        hint="AI가 이 음식이 들어간 메뉴는 '피하기'로 강하게 경고해요."
        chips={allergyFoods}
        placeholder="예: 새우, 땅콩 (입력 후 Enter)"
        onAdd={(raw) => setAllergyFoods((prev) => addChips(prev, raw))}
        onRemove={(chip) => setAllergyFoods((prev) => removeChip(prev, chip))}
      />
      <QuickKeywords
        label="자주 쓰는 알레르기 (눌러서 적용)"
        keywords={COMMON_ALLERGIES}
        selected={allergyFoods}
        onToggle={(keyword) => setAllergyFoods((prev) => toggleKeyword(prev, keyword))}
      />

      <ChipField
        label="좋아하는 음식"
        hint="추천 메뉴에 포함되면 '괜찮아요' 쪽 근거로 써요."
        chips={favoriteFoods}
        placeholder="예: 제육볶음 (입력 후 Enter)"
        onAdd={(raw) => setFavoriteFoods((prev) => addChips(prev, raw))}
        onRemove={(chip) => setFavoriteFoods((prev) => removeChip(prev, chip))}
      />
      <QuickKeywords
        label="인기 메뉴 (눌러서 적용)"
        keywords={COMMON_FAVORITES}
        selected={favoriteFoods}
        onToggle={(keyword) => setFavoriteFoods((prev) => toggleKeyword(prev, keyword))}
      />

      <ChipField
        label="싫어하는 음식"
        hint="메뉴에 있으면 '주의'로 알려줘요."
        chips={dislikedFoods}
        placeholder="예: 오이 (입력 후 Enter)"
        onAdd={(raw) => setDislikedFoods((prev) => addChips(prev, raw))}
        onRemove={(chip) => setDislikedFoods((prev) => removeChip(prev, chip))}
      />
      <QuickKeywords
        label="자주 빼는 재료 (눌러서 적용)"
        keywords={COMMON_DISLIKES}
        selected={dislikedFoods}
        onToggle={(keyword) => setDislikedFoods((prev) => toggleKeyword(prev, keyword))}
      />

      <div className="spicy-field">
        <span className="chip-field-label">매운맛 허용 정도</span>
        <div className="spicy-slider-row">
          <input
            type="range"
            min={0}
            max={SPICY_LEVELS.length - 1}
            step={1}
            value={spicyIndex < 0 ? 2 : spicyIndex}
            onChange={(event) => setSpicyTolerance(SPICY_LEVELS[Number(event.target.value)])}
            aria-label="매운맛 허용 정도"
          />
          <span className="spicy-value">{SPICY_LABEL[spicyTolerance]}</span>
        </div>
        <div className="spicy-scale">
          {SPICY_LEVELS.map((level) => (
            <span key={level} className={level === spicyTolerance ? "active" : ""}>
              {SPICY_LABEL[level]}
            </span>
          ))}
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {status ? (
        <div className="form-success-row">
          <p className="form-success">{status}</p>
          <Link className="text-link" href="/ai/recommend">
            오늘 메뉴 바로 판단하기 →
          </Link>
        </div>
      ) : null}

      <button className="button primary" type="submit">
        저장
      </button>
    </form>
  );
}
