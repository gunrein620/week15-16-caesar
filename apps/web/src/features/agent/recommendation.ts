import type { FoodPreferenceData } from "../food-profile/profile.ts";
import type { MenuDay, MenuDayRow, MealTypeValue } from "../menus/menu-day.ts";

export type RecommendationLevelValue = "GOOD" | "CAUTION" | "AVOID";

export type RecommendInput = {
  question?: unknown;
  date?: unknown;
  mealType?: unknown;
};

export type NormalizedRecommendInput = {
  question: string;
  date?: string;
  mealType?: MealTypeValue;
};

export type RagEvidence = {
  id: string;
  content: string;
};

export type AgentRecommendationInput = {
  question: string;
  selectedMeal: MenuDayRow | null;
  preference: FoodPreferenceData;
  ragResults: RagEvidence[];
};

export type AgentRecommendation = {
  recommendationLevel: RecommendationLevelValue;
  selectedMealType: MealTypeValue | null;
  menuItems: string[];
  matchedAllergies: string[];
  matchedDislikedFoods: string[];
  matchedFavoriteFoods: string[];
  spicyWarnings: string[];
  ragEvidenceCount: number;
  reasons: string[];
  finalMessage: string;
};

const DEFAULT_RECOMMEND_QUESTION = "오늘 메뉴 나한테 괜찮아?";
const RECOMMEND_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SPICY_KEYWORDS = ["매운", "매콤", "제육", "닭갈비", "떡볶이", "마라", "짬뽕", "고추", "김치"];

export function normalizeRecommendInput(input: RecommendInput): NormalizedRecommendInput {
  const question =
    typeof input.question === "string" && input.question.trim()
      ? input.question.trim()
      : DEFAULT_RECOMMEND_QUESTION;

  const date = normalizeOptionalDate(input.date);
  const mealType = normalizeOptionalMealType(input.mealType);

  return {
    question,
    ...(date ? { date } : {}),
    ...(mealType ? { mealType } : {})
  };
}

export function selectRequestedMeal(
  menuDay: MenuDay,
  question: string,
  mealType?: MealTypeValue
): MenuDayRow | null {
  if (mealType === "LUNCH") {
    return menuDay.meals.lunch;
  }

  if (mealType === "DINNER") {
    return menuDay.meals.dinner;
  }

  if (/저녁|dinner/i.test(question)) {
    return menuDay.meals.dinner;
  }

  if (/점심|lunch/i.test(question)) {
    return menuDay.meals.lunch;
  }

  return menuDay.meals.lunch ?? menuDay.meals.dinner;
}

export function buildAgentRecommendation(input: AgentRecommendationInput): AgentRecommendation {
  const menuItems = input.selectedMeal?.items ?? [];
  const matchedAllergies = matchFoodList(menuItems, input.preference.allergyFoods);
  const matchedDislikedFoods = matchFoodList(menuItems, input.preference.dislikedFoods);
  const matchedFavoriteFoods = matchFoodList(menuItems, input.preference.favoriteFoods);
  const spicyWarnings = shouldWarnSpicy(input.preference.spicyTolerance)
    ? menuItems.filter(isSpicyFood)
    : [];
  const reasons = buildReasons({
    menuItems,
    matchedAllergies,
    matchedDislikedFoods,
    matchedFavoriteFoods,
    spicyWarnings,
    ragEvidenceCount: input.ragResults.length
  });
  const recommendationLevel = decideRecommendationLevel({
    menuItems,
    matchedAllergies,
    matchedDislikedFoods,
    spicyWarnings
  });

  return {
    recommendationLevel,
    selectedMealType: input.selectedMeal?.mealType ?? null,
    menuItems,
    matchedAllergies,
    matchedDislikedFoods,
    matchedFavoriteFoods,
    spicyWarnings,
    ragEvidenceCount: input.ragResults.length,
    reasons,
    finalMessage: buildFinalMessage(recommendationLevel, reasons)
  };
}

function normalizeOptionalDate(date: unknown): string | undefined {
  if (date === undefined || date === null || date === "") {
    return undefined;
  }

  if (typeof date !== "string" || !RECOMMEND_DATE_PATTERN.test(date)) {
    throw new Error("recommend date is invalid");
  }

  return date;
}

function normalizeOptionalMealType(mealType: unknown): MealTypeValue | undefined {
  if (mealType === undefined || mealType === null || mealType === "") {
    return undefined;
  }

  if (mealType === "LUNCH" || mealType === "DINNER") {
    return mealType;
  }

  throw new Error("meal type is invalid");
}

function matchFoodList(menuItems: string[], profileFoods: string[]): string[] {
  return profileFoods.filter((food) =>
    menuItems.some((item) => item.toLocaleLowerCase("ko-KR").includes(food.toLocaleLowerCase("ko-KR")))
  );
}

function shouldWarnSpicy(spicyTolerance: FoodPreferenceData["spicyTolerance"]): boolean {
  return spicyTolerance === "NONE" || spicyTolerance === "LOW";
}

function isSpicyFood(menuItem: string): boolean {
  return SPICY_KEYWORDS.some((keyword) => menuItem.includes(keyword));
}

function decideRecommendationLevel(input: {
  menuItems: string[];
  matchedAllergies: string[];
  matchedDislikedFoods: string[];
  spicyWarnings: string[];
}): RecommendationLevelValue {
  if (input.menuItems.length === 0) {
    return "CAUTION";
  }

  if (input.matchedAllergies.length > 0) {
    return "AVOID";
  }

  if (input.matchedDislikedFoods.length > 0 || input.spicyWarnings.length > 0) {
    return "CAUTION";
  }

  return "GOOD";
}

function buildReasons(input: {
  menuItems: string[];
  matchedAllergies: string[];
  matchedDislikedFoods: string[];
  matchedFavoriteFoods: string[];
  spicyWarnings: string[];
  ragEvidenceCount: number;
}): string[] {
  const reasons: string[] = [];

  if (input.menuItems.length === 0) {
    reasons.push("등록된 메뉴가 없어 공식 식단을 먼저 확인해야 합니다.");
  }

  if (input.matchedAllergies.length > 0) {
    reasons.push(`알레르기 음식(${input.matchedAllergies.join(", ")})이 메뉴에 포함되어 있습니다.`);
  }

  if (input.matchedDislikedFoods.length > 0) {
    reasons.push(`싫어하는 음식(${input.matchedDislikedFoods.join(", ")})과 겹칩니다.`);
  }

  if (input.spicyWarnings.length > 0) {
    reasons.push(`매운맛 주의 메뉴(${input.spicyWarnings.join(", ")})가 있습니다.`);
  }

  if (input.matchedFavoriteFoods.length > 0) {
    reasons.push(`좋아하는 음식(${input.matchedFavoriteFoods.join(", ")})이 포함되어 있습니다.`);
  }

  if (input.ragEvidenceCount > 0) {
    reasons.push(`과거 후기/댓글 근거 ${input.ragEvidenceCount}개를 참고했습니다.`);
  }

  if (reasons.length === 0) {
    reasons.push("알레르기, 불호, 매운맛 주의 조건과 직접 겹치지 않습니다.");
  }

  return reasons;
}

function buildFinalMessage(level: RecommendationLevelValue, reasons: string[]): string {
  const summary = reasons.slice(0, 3).join(" ");

  if (level === "AVOID") {
    return `피하는 편이 좋겠습니다. ${summary}`;
  }

  if (level === "CAUTION") {
    return `주의가 필요합니다. ${summary}`;
  }

  return `괜찮아 보여요. ${summary}`;
}
