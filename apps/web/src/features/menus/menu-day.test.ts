import assert from "node:assert/strict";
import test from "node:test";
import { buildMenuApiPath, buildMenuDay, parseMenuDate, shiftMenuDate } from "./menu-day.ts";

test("buildMenuDay groups lunch and dinner for a date", () => {
  const result = buildMenuDay("2026-06-08", [
    {
      id: "menu-1",
      mealType: "LUNCH",
      items: ["rice", "soup"],
      rawText: "rice, soup",
      imageUrl: "/menu/lunch.jpg"
    },
    {
      id: "menu-2",
      mealType: "DINNER",
      items: ["noodle"],
      rawText: null,
      imageUrl: null
    }
  ]);

  assert.deepEqual(result, {
    date: "2026-06-08",
    meals: {
      lunch: {
        id: "menu-1",
        mealType: "LUNCH",
        items: ["rice", "soup"],
        rawText: "rice, soup",
        imageUrl: "/menu/lunch.jpg"
      },
      dinner: {
        id: "menu-2",
        mealType: "DINNER",
        items: ["noodle"],
        rawText: null,
        imageUrl: null
      }
    }
  });
});

test("buildMenuDay returns null meals when no menu exists", () => {
  assert.deepEqual(buildMenuDay("2026-06-08", []), {
    date: "2026-06-08",
    meals: {
      lunch: null,
      dinner: null
    }
  });
});

test("parseMenuDate accepts YYYY-MM-DD only", () => {
  assert.equal(parseMenuDate("2026-06-08").toISOString(), "2026-06-08T00:00:00.000Z");
  assert.throws(() => parseMenuDate("2026/06/08"), /menu date is invalid/);
});

test("buildMenuApiPath includes a valid date query when selected", () => {
  assert.equal(buildMenuApiPath("2026-04-21"), "/api/menus?date=2026-04-21");
  assert.equal(buildMenuApiPath(""), "/api/menus");
});

test("shiftMenuDate moves YYYY-MM-DD dates by day", () => {
  assert.equal(shiftMenuDate("2026-04-21", -1), "2026-04-20");
  assert.equal(shiftMenuDate("2026-04-21", 1), "2026-04-22");
});
