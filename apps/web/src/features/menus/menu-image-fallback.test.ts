import assert from "node:assert/strict";
import test from "node:test";
import {
  currentFeaturedMealType,
  extractMainMenu,
  formatMenuDateShort,
  selectMenuImageState
} from "./menu-image-fallback.ts";

test("extractMainMenu skips rice, soup, and kimchi then returns the first item", () => {
  assert.equal(
    extractMainMenu([
      "아롱사태수육전골",
      "잡곡밥",
      "미역줄기볶음",
      "채소스틱*쌈장",
      "깍두기"
    ]),
    "아롱사태수육전골"
  );
});

test("extractMainMenu skips a rice main dish and falls through to the next item", () => {
  assert.equal(
    extractMainMenu([
      "장조림버터돌솥밥",
      "유부장국",
      "오징어문어핫바",
      "고구마샐러드",
      "배추김치"
    ]),
    "오징어문어핫바"
  );
});

test("extractMainMenu returns null when every item is excluded", () => {
  assert.equal(extractMainMenu(["쌀밥", "미역국", "배추김치"]), null);
  assert.equal(extractMainMenu([]), null);
});

test("currentFeaturedMealType returns LUNCH before 15:00 KST and DINNER after", () => {
  assert.equal(currentFeaturedMealType(new Date("2026-06-08T02:00:00.000Z")), "LUNCH");
  assert.equal(currentFeaturedMealType(new Date("2026-06-08T07:30:00.000Z")), "DINNER");
});

test("selectMenuImageState uses today's real image when present", () => {
  const state = selectMenuImageState({
    todayImageUrl: "/api/menu-images/today.jpg",
    mainMenu: "아롱사태수육전골",
    candidates: [
      { date: "2026-05-02", items: ["아롱사태수육전골", "쌀밥"], imageUrl: "/api/menu-images/old.jpg" }
    ]
  });

  assert.deepEqual(state, {
    imageUrl: "/api/menu-images/today.jpg",
    source: "today",
    substituteDate: null
  });
});

test("selectMenuImageState falls back to the most recent same-main-menu image", () => {
  const state = selectMenuImageState({
    todayImageUrl: null,
    mainMenu: "아롱사태수육전골",
    candidates: [
      { date: "2026-04-10", items: ["아롱사태수육전골", "쌀밥"], imageUrl: "/api/menu-images/a.jpg" },
      { date: "2026-05-02", items: ["아롱사태수육전골", "잡곡밥"], imageUrl: "/api/menu-images/b.jpg" },
      { date: "2026-05-20", items: ["제육볶음"], imageUrl: "/api/menu-images/c.jpg" },
      { date: "2026-05-15", items: ["아롱사태수육전골"], imageUrl: null }
    ]
  });

  assert.deepEqual(state, {
    imageUrl: "/api/menu-images/b.jpg",
    source: "substitute",
    substituteDate: "2026-05-02"
  });
});

test("selectMenuImageState returns none when there is no image to show", () => {
  const state = selectMenuImageState({
    todayImageUrl: null,
    mainMenu: "없는메뉴",
    candidates: [
      { date: "2026-05-02", items: ["아롱사태수육전골"], imageUrl: "/api/menu-images/b.jpg" }
    ]
  });

  assert.deepEqual(state, {
    imageUrl: null,
    source: "none",
    substituteDate: null
  });
});

test("formatMenuDateShort renders M/D from an ISO date", () => {
  assert.equal(formatMenuDateShort("2026-06-02"), "6/2");
  assert.equal(formatMenuDateShort("2026-12-25"), "12/25");
});
