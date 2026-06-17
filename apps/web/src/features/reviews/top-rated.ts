export type MenuRatingInput = {
  rating: number | null;
  menuNames: string[];
};

export type TopRatedMenu = {
  menu: string;
  averageRating: number;
  reviewCount: number;
};

export type BuildTopRatedMenusOptions = {
  limit?: number;
  minReviews?: number;
};

export function buildTopRatedMenus(
  reviews: MenuRatingInput[],
  options: BuildTopRatedMenusOptions = {}
): TopRatedMenu[] {
  const limit = options.limit ?? 5;
  const minReviews = options.minReviews ?? 1;
  const totals = new Map<string, { sum: number; count: number }>();

  for (const review of reviews) {
    if (review.rating === null) {
      continue;
    }

    for (const rawName of review.menuNames) {
      const menu = rawName.trim();

      if (!menu) {
        continue;
      }

      const current = totals.get(menu) ?? { sum: 0, count: 0 };
      current.sum += review.rating;
      current.count += 1;
      totals.set(menu, current);
    }
  }

  return [...totals.entries()]
    .filter(([, value]) => value.count >= minReviews)
    .map(([menu, value]) => ({
      menu,
      averageRating: Math.round((value.sum / value.count) * 10) / 10,
      reviewCount: value.count
    }))
    .sort(
      (a, b) =>
        b.averageRating - a.averageRating ||
        b.reviewCount - a.reviewCount ||
        a.menu.localeCompare(b.menu, "ko-KR")
    )
    .slice(0, limit);
}
