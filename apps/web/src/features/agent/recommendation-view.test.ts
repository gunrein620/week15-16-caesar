import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecommendRequestBody,
  formatMealType,
  formatSpicyTolerance,
  getEvidenceHref,
  recommendationLevelClass,
  recommendationLevelLabel
} from "./recommendation-view.ts";

test("recommendationLevelLabel returns user-facing Korean labels", () => {
  assert.equal(recommendationLevelLabel("GOOD"), "추천");
  assert.equal(recommendationLevelLabel("CAUTION"), "주의");
  assert.equal(recommendationLevelLabel("AVOID"), "피하기");
});

test("recommendationLevelClass maps levels to existing chip variants", () => {
  assert.equal(recommendationLevelClass("GOOD"), "good");
  assert.equal(recommendationLevelClass("CAUTION"), "warn");
  assert.equal(recommendationLevelClass("AVOID"), "danger");
});

test("formatMealType handles lunch dinner and missing meal", () => {
  assert.equal(formatMealType("LUNCH"), "점심");
  assert.equal(formatMealType("DINNER"), "저녁");
  assert.equal(formatMealType(null), "선택된 끼니 없음");
});

test("formatSpicyTolerance returns concise profile labels", () => {
  assert.equal(formatSpicyTolerance("NONE"), "못 먹음");
  assert.equal(formatSpicyTolerance("LOW"), "낮음");
  assert.equal(formatSpicyTolerance("MEDIUM"), "보통");
  assert.equal(formatSpicyTolerance("HIGH"), "높음");
});

test("buildRecommendRequestBody trims text and omits empty optional fields", () => {
  assert.deepEqual(
    buildRecommendRequestBody({
      question: "  오늘 저녁 괜찮아?  ",
      date: "",
      mealType: ""
    }),
    {
      question: "오늘 저녁 괜찮아?"
    }
  );

  assert.deepEqual(
    buildRecommendRequestBody({
      question: "오늘 점심 어때?",
      date: "2026-06-08",
      mealType: "LUNCH"
    }),
    {
      question: "오늘 점심 어때?",
      date: "2026-06-08",
      mealType: "LUNCH"
    }
  );
});

test("getEvidenceHref links reviews and comment evidence to the source review", () => {
  assert.equal(getEvidenceHref({ review: { id: "review-1" }, comment: null }), "/reviews/review-1");
  assert.equal(
    getEvidenceHref({
      review: null,
      comment: {
        review: {
          id: "review-2"
        }
      }
    }),
    "/reviews/review-2"
  );
  assert.equal(getEvidenceHref({ review: null, comment: null }), null);
});
