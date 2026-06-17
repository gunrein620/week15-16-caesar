import assert from "node:assert/strict";
import test from "node:test";
import { addChips, removeChip, SPICY_LEVELS } from "./chips.ts";

test("addChips splits on comma and newline, trims, and drops blanks", () => {
  assert.deepEqual(addChips([], "새우, 땅콩\n계란"), ["새우", "땅콩", "계란"]);
  assert.deepEqual(addChips([], "  ,  "), []);
});

test("addChips dedupes case-insensitively against existing chips", () => {
  assert.deepEqual(addChips(["새우"], "새우, 우유"), ["새우", "우유"]);
  assert.deepEqual(addChips(["Shrimp"], "shrimp"), ["Shrimp"]);
});

test("removeChip removes an exact match only", () => {
  assert.deepEqual(removeChip(["새우", "우유"], "새우"), ["우유"]);
  assert.deepEqual(removeChip(["새우"], "땅콩"), ["새우"]);
});

test("SPICY_LEVELS is ordered from none to high", () => {
  assert.deepEqual([...SPICY_LEVELS], ["NONE", "LOW", "MEDIUM", "HIGH"]);
});
