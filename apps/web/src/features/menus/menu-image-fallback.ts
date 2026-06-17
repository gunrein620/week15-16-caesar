import type { MealTypeValue } from "./menu-day.ts";

export type MenuImageSource = "today" | "substitute" | "none";

export type MenuImageCandidate = {
  date: string;
  items: string[];
  imageUrl: string | null;
};

export type MenuImageState = {
  imageUrl: string | null;
  source: MenuImageSource;
  substituteDate: string | null;
};

export type SelectMenuImageStateInput = {
  todayImageUrl: string | null;
  mainMenu: string | null;
  candidates: MenuImageCandidate[];
};

const FEATURED_DINNER_FROM_HOUR = 15;

function isExcludedFromMainMenu(item: string): boolean {
  const value = item.trim();

  if (!value) {
    return true;
  }

  return value.includes("밥") || value.includes("국") || value.includes("김치") || value.includes("깍두기");
}

export function extractMainMenu(items: string[]): string | null {
  for (const item of items) {
    const value = item.trim();

    if (value && !isExcludedFromMainMenu(value)) {
      return value;
    }
  }

  return null;
}

export function currentFeaturedMealType(now: Date = new Date()): MealTypeValue {
  const kstHour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Asia/Seoul"
    }).format(now)
  );

  return kstHour < FEATURED_DINNER_FROM_HOUR ? "LUNCH" : "DINNER";
}

export function selectMenuImageState(input: SelectMenuImageStateInput): MenuImageState {
  if (input.todayImageUrl) {
    return { imageUrl: input.todayImageUrl, source: "today", substituteDate: null };
  }

  const substitute = pickSubstitute(input.mainMenu, input.candidates);

  if (substitute) {
    return {
      imageUrl: substitute.imageUrl as string,
      source: "substitute",
      substituteDate: substitute.date
    };
  }

  return { imageUrl: null, source: "none", substituteDate: null };
}

function pickSubstitute(
  mainMenu: string | null,
  candidates: MenuImageCandidate[]
): MenuImageCandidate | null {
  if (!mainMenu) {
    return null;
  }

  return candidates
    .filter((candidate) => candidate.imageUrl && extractMainMenu(candidate.items) === mainMenu)
    .reduce<MenuImageCandidate | null>((latest, candidate) => {
      if (!latest || candidate.date > latest.date) {
        return candidate;
      }

      return latest;
    }, null);
}

export function formatMenuDateShort(date: string): string {
  const [, month, day] = date.split("-");

  return `${Number(month)}/${Number(day)}`;
}
