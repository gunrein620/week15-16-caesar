export type FeedMealType = "LUNCH" | "DINNER";

export type FeedMealMenu = {
  id: string;
  mealDate: string;
  mealType: FeedMealType;
  menuText: string;
  imageUrl: string;
};

export type FeedMealContext = {
  ateLunch: boolean;
  ateDinner: boolean;
  mealNote: string | null;
  lunchMenu: FeedMealMenu | null;
  dinnerMenu: FeedMealMenu | null;
};

export type RecentMealResponse = {
  meal: FeedMealMenu | null;
  message: string;
  source: "fresh" | "cache" | "empty";
};
