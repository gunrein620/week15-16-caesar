export type MealTypeValue = "LUNCH" | "DINNER";

export type MenuDayRow = {
  id: string;
  mealType: MealTypeValue;
  items: string[];
  rawText: string | null;
  imageUrl: string | null;
};

export type MenuDay = {
  date: string;
  meals: {
    lunch: MenuDayRow | null;
    dinner: MenuDayRow | null;
  };
};

const MENU_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function buildMenuDay(date: string, rows: MenuDayRow[]): MenuDay {
  return {
    date,
    meals: {
      lunch: rows.find((row) => row.mealType === "LUNCH") ?? null,
      dinner: rows.find((row) => row.mealType === "DINNER") ?? null
    }
  };
}

export function parseMenuDate(date: string): Date {
  if (!MENU_DATE_PATTERN.test(date)) {
    throw new Error("menu date is invalid");
  }

  return new Date(`${date}T00:00:00.000Z`);
}

export function isMenuDateText(date: string): boolean {
  return MENU_DATE_PATTERN.test(date);
}

export function buildMenuApiPath(date: string): string {
  const selectedDate = date.trim();

  if (!selectedDate) {
    return "/api/menus";
  }

  return `/api/menus?date=${encodeURIComponent(selectedDate)}`;
}

export function shiftMenuDate(date: string, dayOffset: number): string {
  const nextDate = new Date(parseMenuDate(date).getTime() + dayOffset * DAY_IN_MS);
  return nextDate.toISOString().slice(0, 10);
}

export function todayKstDateText(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric"
  }).format(now);
}
