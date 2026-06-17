import type { RecommendationLevelValue } from "./recommendation.ts";
import type { SpicyToleranceValue } from "../food-profile/profile.ts";
import type { MealTypeValue } from "../menus/menu-day.ts";

export type RecommendationChipClass = "good" | "warn" | "danger";

export type RecommendRequestForm = {
  question: string;
  date: string;
  mealType: MealTypeValue | "";
};

export type EvidenceLinkSource = {
  review: { id: string } | null;
  comment: { review: { id: string } } | null;
};

const DEFAULT_QUESTION = "오늘 메뉴 나한테 괜찮아?";

export function recommendationLevelLabel(level: RecommendationLevelValue): string {
  if (level === "GOOD") {
    return "추천";
  }

  if (level === "CAUTION") {
    return "주의";
  }

  return "피하기";
}

export function recommendationLevelClass(level: RecommendationLevelValue): RecommendationChipClass {
  if (level === "GOOD") {
    return "good";
  }

  if (level === "CAUTION") {
    return "warn";
  }

  return "danger";
}

export function formatMealType(mealType: MealTypeValue | null): string {
  if (mealType === "LUNCH") {
    return "점심";
  }

  if (mealType === "DINNER") {
    return "저녁";
  }

  return "선택된 끼니 없음";
}

export function formatSpicyTolerance(spicyTolerance: SpicyToleranceValue): string {
  if (spicyTolerance === "NONE") {
    return "못 먹음";
  }

  if (spicyTolerance === "LOW") {
    return "낮음";
  }

  if (spicyTolerance === "HIGH") {
    return "높음";
  }

  return "보통";
}

export function buildRecommendRequestBody(input: RecommendRequestForm): {
  question: string;
  date?: string;
  mealType?: MealTypeValue;
} {
  const question = input.question.trim() || DEFAULT_QUESTION;

  return {
    question,
    ...(input.date ? { date: input.date } : {}),
    ...(input.mealType ? { mealType: input.mealType } : {})
  };
}

export function getEvidenceHref(source: EvidenceLinkSource): string | null {
  const reviewId = source.review?.id ?? source.comment?.review.id;

  return reviewId ? `/reviews/${reviewId}` : null;
}
