"use client";

type StarRatingProps = {
  /** 1~5 평점. null이면 미평가로 표시 */
  value: number | null;
  /** 클릭 가능한 입력 모드로 동작 (작성 폼용) */
  onChange?: (next: number) => void;
  size?: "sm" | "md" | "lg";
};

const STARS = [1, 2, 3, 4, 5];

/**
 * 별점 시각화/입력 컴포넌트.
 * - onChange 없으면 읽기 전용(목록·상세), 있으면 클릭 입력(작성 폼).
 */
export function StarRating({ value, onChange, size = "md" }: StarRatingProps) {
  const interactive = typeof onChange === "function";
  const current = value ?? 0;

  if (!interactive && value === null) {
    return <span className="star-rating muted-text">미평가</span>;
  }

  return (
    <span
      aria-label={interactive ? "별점 선택" : `별점 ${current}점`}
      className={`star-rating ${size} ${interactive ? "interactive" : ""}`}
      role={interactive ? "radiogroup" : "img"}
    >
      {STARS.map((star) => {
        const filled = star <= current;
        const symbol = filled ? "★" : "☆";

        if (!interactive) {
          return (
            <span aria-hidden className={`star ${filled ? "on" : ""}`} key={star}>
              {symbol}
            </span>
          );
        }

        return (
          <button
            aria-checked={star === current}
            aria-label={`${star}점`}
            className={`star ${filled ? "on" : ""}`}
            key={star}
            onClick={() => onChange?.(star)}
            role="radio"
            type="button"
          >
            {symbol}
          </button>
        );
      })}
      {!interactive ? <span className="star-value">{current}/5</span> : null}
    </span>
  );
}
