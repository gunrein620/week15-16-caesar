import assert from "node:assert/strict";
import test from "node:test";
import { buildTopRatedMenus } from "./top-rated.ts";

test("buildTopRatedMenus aggregates average rating per menu and sorts by rating", () => {
  const result = buildTopRatedMenus([
    { rating: 5, menuNames: ["탄탄멘"] },
    { rating: 4, menuNames: ["탄탄멘"] },
    { rating: 5, menuNames: ["제육볶음"] },
    { rating: 2, menuNames: ["김치찌개"] }
  ]);

  assert.deepEqual(result, [
    { menu: "제육볶음", averageRating: 5, reviewCount: 1 },
    { menu: "탄탄멘", averageRating: 4.5, reviewCount: 2 },
    { menu: "김치찌개", averageRating: 2, reviewCount: 1 }
  ]);
});

test("buildTopRatedMenus rounds the average to one decimal", () => {
  const result = buildTopRatedMenus([
    { rating: 5, menuNames: ["돈까스"] },
    { rating: 4, menuNames: ["돈까스"] },
    { rating: 4, menuNames: ["돈까스"] }
  ]);

  assert.equal(result[0].averageRating, 4.3);
  assert.equal(result[0].reviewCount, 3);
});

test("buildTopRatedMenus skips blank menu names and respects the limit", () => {
  const result = buildTopRatedMenus(
    [
      { rating: 5, menuNames: ["A", "  ", ""] },
      { rating: 4, menuNames: ["B"] },
      { rating: 3, menuNames: ["C"] }
    ],
    { limit: 2 }
  );

  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((entry) => entry.menu),
    ["A", "B"]
  );
});

test("buildTopRatedMenus filters out menus below the minimum review count", () => {
  const result = buildTopRatedMenus(
    [
      { rating: 5, menuNames: ["인기"] },
      { rating: 4, menuNames: ["인기"] },
      { rating: 5, menuNames: ["한번만"] }
    ],
    { minReviews: 2 }
  );

  assert.deepEqual(result, [{ menu: "인기", averageRating: 4.5, reviewCount: 2 }]);
});

test("buildTopRatedMenus skips reviews without a rating", () => {
  const result = buildTopRatedMenus([
    { rating: null, menuNames: ["탄탄멘"] },
    { rating: 5, menuNames: ["탄탄멘"] }
  ]);

  assert.deepEqual(result, [{ menu: "탄탄멘", averageRating: 5, reviewCount: 1 }]);
});

test("buildTopRatedMenus returns an empty array when there are no reviews", () => {
  assert.deepEqual(buildTopRatedMenus([]), []);
});
