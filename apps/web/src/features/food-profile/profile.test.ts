import assert from "node:assert/strict";
import test from "node:test";
import { defaultFoodPreference, saveFoodPreference } from "./profile.ts";

test("defaultFoodPreference returns empty lists with medium spicy tolerance", () => {
  assert.deepEqual(defaultFoodPreference(), {
    allergyFoods: [],
    favoriteFoods: [],
    dislikedFoods: [],
    spicyTolerance: "MEDIUM"
  });
});

test("saveFoodPreference normalizes food lists and removes duplicates", async () => {
  const saved = await saveFoodPreference(
    "user-1",
    {
      allergyFoods: "peanut, shrimp\npeanut",
      favoriteFoods: ["kimchi stew", " rice ", "kimchi stew"],
      dislikedFoods: "cilantro,,",
      spicyTolerance: "LOW"
    },
    {
      upsertPreference: async (userId, data) => ({
        userId,
        ...data
      })
    }
  );

  assert.deepEqual(saved, {
    userId: "user-1",
    allergyFoods: ["peanut", "shrimp"],
    favoriteFoods: ["kimchi stew", "rice"],
    dislikedFoods: ["cilantro"],
    spicyTolerance: "LOW"
  });
});

test("saveFoodPreference rejects invalid spicy tolerance", async () => {
  await assert.rejects(
    () =>
      saveFoodPreference(
        "user-1",
        {
          allergyFoods: [],
          favoriteFoods: [],
          dislikedFoods: [],
          spicyTolerance: "EXTREME"
        },
        {
          upsertPreference: async () => {
            throw new Error("upsertPreference must not be called");
          }
        }
      ),
    /spicy tolerance is invalid/
  );
});
