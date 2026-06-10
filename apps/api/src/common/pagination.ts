export type PageQuery = {
  page?: number;
  limit?: number;
};

export function normalizePagination(query: PageQuery) {
  const rawPage = Number(query.page ?? 1);
  const rawLimit = Number(query.limit ?? 20);
  const page = Math.max(Number.isFinite(rawPage) ? rawPage : 1, 1);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), 50);
  return {
    page,
    limit,
    skip: (page - 1) * limit
  };
}
