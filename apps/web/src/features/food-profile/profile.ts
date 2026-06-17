const SPICY_TOLERANCES = ["NONE", "LOW", "MEDIUM", "HIGH"] as const;

export type SpicyToleranceValue = (typeof SPICY_TOLERANCES)[number];

export type FoodPreferenceData = {
  allergyFoods: string[];
  favoriteFoods: string[];
  dislikedFoods: string[];
  spicyTolerance: SpicyToleranceValue;
};

export type FoodPreferenceInput = {
  allergyFoods: string | string[];
  favoriteFoods: string | string[];
  dislikedFoods: string | string[];
  spicyTolerance: string;
};

export type SaveFoodPreferenceDependencies = {
  upsertPreference(userId: string, data: FoodPreferenceData): Promise<FoodPreferenceData & { userId: string }>;
};

export function defaultFoodPreference(): FoodPreferenceData {
  return {
    allergyFoods: [],
    favoriteFoods: [],
    dislikedFoods: [],
    spicyTolerance: "MEDIUM"
  };
}

export async function saveFoodPreference(
  userId: string,
  input: FoodPreferenceInput,
  dependencies: SaveFoodPreferenceDependencies
): Promise<FoodPreferenceData & { userId: string }> {
  const spicyTolerance = normalizeSpicyTolerance(input.spicyTolerance);

  return dependencies.upsertPreference(userId, {
    allergyFoods: normalizeFoodList(input.allergyFoods),
    favoriteFoods: normalizeFoodList(input.favoriteFoods),
    dislikedFoods: normalizeFoodList(input.dislikedFoods),
    spicyTolerance
  });
}

function normalizeFoodList(value: string | string[]): string[] {
  const rawItems = Array.isArray(value) ? value : value.split(/[,\n]/);
  const items: string[] = [];

  for (const rawItem of rawItems) {
    const item = rawItem.trim();

    if (item && !items.includes(item)) {
      items.push(item);
    }
  }

  return items;
}

function normalizeSpicyTolerance(value: string): SpicyToleranceValue {
  if (SPICY_TOLERANCES.includes(value as SpicyToleranceValue)) {
    return value as SpicyToleranceValue;
  }

  throw new Error("spicy tolerance is invalid");
}
