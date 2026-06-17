"use client";

import Link from "next/link";
import { type ChangeEvent, useEffect, useState } from "react";
import {
  buildMenuApiPath,
  isMenuDateText,
  shiftMenuDate,
  todayKstDateText,
  type MenuDay,
  type MenuDayRow
} from "./menu-day";

function formatMealLabel(mealType: "lunch" | "dinner"): string {
  return mealType === "lunch" ? "점심" : "저녁";
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

type WeekDay = {
  date: string;
  dayOfWeek: number;
  dayOfMonth: number;
};

/** 선택한 날짜가 속한 주(월~일) 7일을 계산 */
function buildWeekDays(date: string): WeekDay[] {
  if (!isMenuDateText(date)) {
    return [];
  }

  const base = new Date(`${date}T00:00:00.000Z`);
  const dayOfWeek = base.getUTCDay(); // 0=일요일
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const days: WeekDay[] = [];

  for (let index = 0; index < 7; index += 1) {
    const text = shiftMenuDate(date, mondayOffset + index);
    const current = new Date(`${text}T00:00:00.000Z`);
    days.push({
      date: text,
      dayOfWeek: current.getUTCDay(),
      dayOfMonth: current.getUTCDate()
    });
  }

  return days;
}

function readInitialMenuDate(): string {
  if (typeof window === "undefined") {
    return todayKstDateText();
  }

  const date = new URLSearchParams(window.location.search).get("date") ?? "";
  return isMenuDateText(date) ? date : todayKstDateText();
}

function replaceMenuDateQuery(date: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("date", date);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

// 아직 사진이 안 올라온 끼니는 모두 동일한 이모지로 통일한다.
const MENU_PLACEHOLDER_EMOJI = "🍽️";

type FoodAlertProfile = {
  allergyFoods: string[];
  dislikedFoods: string[];
};

type MenuRating = { average: number; count: number };
type MenuRatingMap = Record<string, MenuRating>;

type MenuReview = {
  id: string;
  title: string;
  rating: number | null;
  menuNames: string[];
  author: { name: string };
};

function reviewStars(rating: number | null): string {
  const filled = Math.max(0, Math.min(5, rating ?? 0));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

// 메뉴 항목이 내 알레르기/기피 재료를 포함하는지 판별한다(부분 일치).
function matchedKeyword(item: string, keywords: string[]): string | null {
  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (trimmed && item.includes(trimmed)) {
      return trimmed;
    }
  }
  return null;
}

function itemAlertClass(item: string, profile: FoodAlertProfile): "" | "alert-allergy" | "alert-disliked" {
  if (matchedKeyword(item, profile.allergyFoods)) {
    return "alert-allergy";
  }
  if (matchedKeyword(item, profile.dislikedFoods)) {
    return "alert-disliked";
  }
  return "";
}

function MenuMealCard({
  meal,
  mealType,
  profile,
  ratings
}: {
  meal: MenuDayRow | null;
  mealType: "lunch" | "dinner";
  profile: FoodAlertProfile;
  ratings: MenuRatingMap;
}) {
  const mealLabel = formatMealLabel(mealType);
  const items = meal?.items ?? [];
  const hasImage = Boolean(meal?.imageUrl);
  const hasItems = items.length > 0;

  return (
    <article className="panel menu-card">
      <h2>{mealLabel}</h2>
      {hasImage ? (
        <img alt={`${mealLabel} 메뉴`} className="menu-image" src={meal?.imageUrl ?? ""} />
      ) : (
        <div className="menu-empty">
          <span aria-hidden className="menu-empty-emoji">
            {MENU_PLACEHOLDER_EMOJI}
          </span>
          {!hasItems ? <p>메뉴가 아직 없어요</p> : null}
        </div>
      )}
      {hasItems ? (
        <ul className="list">
          {items.map((item) => {
            const alertClass = itemAlertClass(item, profile);
            const rating = ratings[item.trim()];
            return (
              <li className={alertClass} key={item}>
                {item}
                {alertClass === "alert-allergy" ? <span className="alert-tag">알레르기</span> : null}
                {alertClass === "alert-disliked" ? <span className="alert-tag muted">기피</span> : null}
                {rating ? (
                  <span className="menu-rating-badge" title={`후기 ${rating.count}개`}>
                    ★ {rating.average.toFixed(1)} ({rating.count})
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {hasItems ? (
        <Link className="button menu-review-cta" href={`/reviews/new?menu=${encodeURIComponent(items.join(", "))}`}>
          이 메뉴 후기 쓰기
        </Link>
      ) : null}
    </article>
  );
}

export function MenusClient() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [menuDay, setMenuDay] = useState<MenuDay | null>(null);
  const [profile, setProfile] = useState<FoodAlertProfile>({ allergyFoods: [], dislikedFoods: [] });
  const [ratings, setRatings] = useState<MenuRatingMap>({});
  const [menuReviews, setMenuReviews] = useState<MenuReview[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setSelectedDate(readInitialMenuDate());
  }, []);

  // 로그인 상태면 내 음식 프로필을 불러와 알레르기/기피 하이라이트에 쓴다.
  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const response = await fetch("/api/profile/food");
        if (!response.ok) {
          return; // 비로그인(401) 등은 하이라이트 없이 진행
        }
        const body = (await response.json()) as {
          preference?: { allergyFoods?: string[]; dislikedFoods?: string[] };
        };
        if (active && body.preference) {
          setProfile({
            allergyFoods: body.preference.allergyFoods ?? [],
            dislikedFoods: body.preference.dislikedFoods ?? []
          });
        }
      } catch {
        // 프로필 로드 실패는 무시(하이라이트만 비활성)
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, []);

  // 선택한 날짜 메뉴의 평점 요약을 불러온다(그날 메뉴만 집계).
  useEffect(() => {
    if (!selectedDate) {
      return;
    }
    let active = true;

    async function loadRatings() {
      try {
        const response = await fetch(`/api/menus/ratings?date=${encodeURIComponent(selectedDate ?? "")}`);
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as { ratings?: MenuRatingMap };
        if (active && body.ratings) {
          setRatings(body.ratings);
        }
      } catch {
        // 평점 요약 로드 실패는 무시
      }
    }

    loadRatings();
    return () => {
      active = false;
    };
  }, [selectedDate]);

  useEffect(() => {
    if (!selectedDate) {
      return;
    }

    const controller = new AbortController();
    const dateForRequest = selectedDate;

    async function loadMenus() {
      setError("");
      setIsLoading(true);

      try {
        const response = await fetch(buildMenuApiPath(dateForRequest), {
          signal: controller.signal
        });

        if (!response.ok) {
          setMenuDay(null);
          setError("식단을 불러오지 못했습니다.");
          return;
        }

        const body = (await response.json()) as { menuDay: MenuDay };
        setMenuDay(body.menuDay);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }

        setMenuDay(null);
        setError("식단을 불러오지 못했습니다.");
      } finally {
        if (controller.signal.aborted) {
          return;
        }

        setIsLoading(false);
      }
    }

    loadMenus();

    return () => {
      controller.abort();
    };
  }, [selectedDate]);

  // 선택한 날짜의 메뉴를 언급한 과거 후기를 불러온다.
  useEffect(() => {
    if (!selectedDate) {
      return;
    }
    let active = true;

    async function loadMenuReviews() {
      try {
        const response = await fetch(`/api/menus/reviews?date=${encodeURIComponent(selectedDate ?? "")}`);
        if (!response.ok) {
          if (active) {
            setMenuReviews([]);
          }
          return;
        }
        const body = (await response.json()) as { reviews?: MenuReview[] };
        if (active) {
          setMenuReviews(body.reviews ?? []);
        }
      } catch {
        if (active) {
          setMenuReviews([]);
        }
      }
    }

    loadMenuReviews();
    return () => {
      active = false;
    };
  }, [selectedDate]);

  function selectDate(date: string): void {
    if (!isMenuDateText(date)) {
      return;
    }

    setSelectedDate(date);
    replaceMenuDateQuery(date);
  }

  function handleDateChange(event: ChangeEvent<HTMLInputElement>): void {
    selectDate(event.target.value);
  }

  function handleDateShift(dayOffset: number): void {
    if (!selectedDate || !isMenuDateText(selectedDate)) {
      return;
    }

    selectDate(shiftMenuDate(selectedDate, dayOffset));
  }

  const canShiftDate = Boolean(selectedDate && isMenuDateText(selectedDate));
  const weekDays = selectedDate ? buildWeekDays(selectedDate) : [];

  return (
    <section className="menu-day">
      <div className="menu-toolbar">
        <div className="section-title">
          <h2>{menuDay?.date ?? selectedDate ?? "식단"}</h2>
        </div>
        <div aria-label="식단 날짜 이동" className="menu-date-controls">
          <button className="button" disabled={!canShiftDate} onClick={() => handleDateShift(-1)} type="button">
            이전
          </button>
          <label className="menu-date-field">
            <span>날짜</span>
            <input disabled={!selectedDate} onChange={handleDateChange} type="date" value={selectedDate ?? ""} />
          </label>
          <button className="button" disabled={!canShiftDate} onClick={() => handleDateShift(1)} type="button">
            다음
          </button>
        </div>
      </div>

      {weekDays.length > 0 ? (
        <div aria-label="주간 식단 보기" className="menu-week-strip">
          {weekDays.map((day) => {
            const isWeekend = day.dayOfWeek === 0 || day.dayOfWeek === 6;
            const isSelected = day.date === selectedDate;
            return (
              <button
                aria-pressed={isSelected}
                className={`menu-week-day ${isSelected ? "on" : ""} ${isWeekend ? "is-weekend" : ""}`}
                key={day.date}
                onClick={() => selectDate(day.date)}
                type="button"
              >
                <span className="dow">{WEEKDAY_LABELS[day.dayOfWeek]}</span>
                <span className="dom">{day.dayOfMonth}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}
      {isLoading && !menuDay ? <p className="helper-text">불러오는 중...</p> : null}

      {menuDay && hasAnyAlert(menuDay, profile) ? (
        <p className="menu-alert-legend">
          <span className="alert-tag">알레르기</span> 내 알레르기 재료 ·
          <span className="alert-tag muted">기피</span> 싫어하는 재료가 메뉴에 포함돼 있어요.
        </p>
      ) : null}

      {menuDay ? (
        <div className="grid two">
          <MenuMealCard meal={menuDay.meals.lunch} mealType="lunch" profile={profile} ratings={ratings} />
          <MenuMealCard meal={menuDay.meals.dinner} mealType="dinner" profile={profile} ratings={ratings} />
        </div>
      ) : null}

      {menuReviews.length > 0 ? (
        <section className="menu-reviews" aria-label="이 날 메뉴 후기">
          <div className="section-title">
            <h2>💬 이 날 메뉴 후기</h2>
            <Link className="text-link" href="/reviews">
              후기 더 보기 →
            </Link>
          </div>
          <div className="menu-reviews-list">
            {menuReviews.map((review) => (
              <Link className="menu-review-item" href={`/reviews/${review.id}`} key={review.id}>
                <span className="menu-review-stars">{reviewStars(review.rating)}</span>
                <span className="menu-review-title">{review.title}</span>
                <span className="menu-review-author">{review.author.name}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

// 표시 중인 날짜의 메뉴에 알레르기/기피 항목이 하나라도 있는지 확인한다.
function hasAnyAlert(menuDay: MenuDay, profile: FoodAlertProfile): boolean {
  const allItems = [...(menuDay.meals.lunch?.items ?? []), ...(menuDay.meals.dinner?.items ?? [])];
  return allItems.some((item) => itemAlertClass(item, profile) !== "");
}
