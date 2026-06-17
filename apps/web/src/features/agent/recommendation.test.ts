import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgentRecommendation,
  normalizeRecommendInput,
  selectRequestedMeal
} from "./recommendation.ts";

const menuDay = {
  date: "2026-06-08",
  meals: {
    lunch: {
      id: "menu-lunch",
      mealType: "LUNCH" as const,
      items: ["제육볶음", "잡곡밥", "배추김치"],
      rawText: null,
      imageUrl: null
    },
    dinner: {
      id: "menu-dinner",
      mealType: "DINNER" as const,
      items: ["새우볶음밥", "미역국"],
      rawText: null,
      imageUrl: null
    }
  }
};

test("normalizeRecommendInput trims question and validates optional date and meal type", () => {
  assert.deepEqual(
    normalizeRecommendInput({
      question: "  오늘 저녁 괜찮아?  ",
      date: "2026-06-08",
      mealType: "DINNER"
    }),
    {
      question: "오늘 저녁 괜찮아?",
      date: "2026-06-08",
      mealType: "DINNER"
    }
  );

  assert.equal(normalizeRecommendInput({ question: "   " }).question, "오늘 메뉴 나한테 괜찮아?");
  assert.throws(() => normalizeRecommendInput({ question: "x", date: "2026/06/08" }), /recommend date is invalid/);
  assert.throws(() => normalizeRecommendInput({ question: "x", mealType: "SNACK" }), /meal type is invalid/);
});

test("selectRequestedMeal uses explicit meal type before question inference", () => {
  assert.equal(selectRequestedMeal(menuDay, "점심 말고 저녁", "LUNCH")?.id, "menu-lunch");
  assert.equal(selectRequestedMeal(menuDay, "오늘 저녁 괜찮아?")?.id, "menu-dinner");
  assert.equal(selectRequestedMeal(menuDay, "오늘 메뉴 괜찮아?")?.id, "menu-lunch");
});

test("buildAgentRecommendation avoids menus that match allergy foods", () => {
  const result = buildAgentRecommendation({
    question: "새우볶음밥 먹어도 돼?",
    selectedMeal: menuDay.meals.dinner,
    preference: {
      allergyFoods: ["새우"],
      favoriteFoods: [],
      dislikedFoods: [],
      spicyTolerance: "MEDIUM"
    },
    ragResults: []
  });

  assert.equal(result.recommendationLevel, "AVOID");
  assert.deepEqual(result.matchedAllergies, ["새우"]);
  assert.match(result.finalMessage, /피하는 편/);
});

test("buildAgentRecommendation cautions low spicy tolerance for spicy menu items", () => {
  const result = buildAgentRecommendation({
    question: "점심 어때?",
    selectedMeal: menuDay.meals.lunch,
    preference: {
      allergyFoods: [],
      favoriteFoods: [],
      dislikedFoods: [],
      spicyTolerance: "NONE"
    },
    ragResults: []
  });

  assert.equal(result.recommendationLevel, "CAUTION");
  assert.deepEqual(result.spicyWarnings, ["제육볶음", "배추김치"]);
  assert.match(result.finalMessage, /매운맛/);
});

test("buildAgentRecommendation recommends good when favorites match without warnings", () => {
  const result = buildAgentRecommendation({
    question: "저녁 괜찮아?",
    selectedMeal: menuDay.meals.dinner,
    preference: {
      allergyFoods: [],
      favoriteFoods: ["미역국"],
      dislikedFoods: [],
      spicyTolerance: "MEDIUM"
    },
    ragResults: [{ id: "chunk-1", content: "미역국이 담백했다." }]
  });

  assert.equal(result.recommendationLevel, "GOOD");
  assert.deepEqual(result.matchedFavoriteFoods, ["미역국"]);
  assert.equal(result.ragEvidenceCount, 1);
  assert.match(result.finalMessage, /괜찮아 보여요/);
});
