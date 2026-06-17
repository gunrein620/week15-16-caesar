const MAX_PAGE_SIZE = 30;

export type ReviewInput = {
  title?: unknown;
  content?: unknown;
  rating?: unknown;
  menuArchiveId?: unknown;
  imageUrl?: unknown;
  menuNames?: unknown;
  tags?: unknown;
};

export type NormalizedReviewInput = {
  title: string;
  content: string;
  rating: number | null;
  menuArchiveId: string | null;
  imageUrl: string | null;
  menuNames: string[];
  tags: string[];
};

export type ReviewListQuery = {
  page: number;
  pageSize: number;
  query: string;
  tag: string;
  menu: string;
};

export type Pagination = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function normalizeReviewInput(input: ReviewInput): NormalizedReviewInput {
  const title = normalizeRequiredText(input.title, "title");
  const content = normalizeRequiredText(input.content, "content");

  return {
    title,
    content,
    rating: normalizeRating(input.rating),
    menuArchiveId: normalizeOptionalText(input.menuArchiveId),
    imageUrl: normalizeOptionalText(input.imageUrl),
    menuNames: normalizeList(input.menuNames, { stripHash: false }),
    tags: normalizeList(input.tags, { stripHash: true })
  };
}

export function parseReviewListQuery(searchParams: URLSearchParams): ReviewListQuery {
  return {
    page: clampPositiveInt(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER),
    pageSize: clampPositiveInt(searchParams.get("pageSize"), 10, MAX_PAGE_SIZE),
    query: normalizeSearchText(searchParams.get("query")),
    tag: normalizeSearchText(searchParams.get("tag")),
    menu: normalizeSearchText(searchParams.get("menu"))
  };
}

export function buildPagination(input: {
  total: number;
  page: number;
  pageSize: number;
}): Pagination {
  return {
    total: input.total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.max(1, Math.ceil(input.total / input.pageSize))
  };
}

export function buildReviewListSearchParams(query: ReviewListQuery): URLSearchParams {
  const searchParams = new URLSearchParams();
  const normalizedQuery = query.query.trim();
  const normalizedTag = query.tag.trim();
  const normalizedMenu = query.menu.trim();

  searchParams.set("pageSize", String(query.pageSize));

  if (normalizedQuery) {
    searchParams.set("query", normalizedQuery);
  }

  if (normalizedTag) {
    searchParams.set("tag", normalizedTag);
  }

  if (normalizedMenu) {
    searchParams.set("menu", normalizedMenu);
  }

  if (query.page > 1) {
    searchParams.set("page", String(query.page));
  }

  return searchParams;
}

export function clampReviewPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), Math.max(1, totalPages));
}

export function assertReviewAuthor(
  review: { authorId: string } | null,
  userId: string
): asserts review is { authorId: string } {
  if (!review) {
    throw new Error("review not found");
  }

  if (review.authorId !== userId) {
    throw new Error("forbidden");
  }
}

function normalizeRequiredText(value: unknown, fieldName: string): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw new Error(`${fieldName} is required`);
  }

  return text;
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();

  return text || null;
}

function normalizeRating(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const rating = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("rating must be between 1 and 5");
  }

  return rating;
}

function normalizeList(value: unknown, options: { stripHash: boolean }): string[] {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n]/)
      : [];
  const items: string[] = [];

  for (const rawItem of rawItems) {
    if (typeof rawItem !== "string") {
      continue;
    }

    const item = normalizeListItem(rawItem, options);

    if (item && !items.includes(item)) {
      items.push(item);
    }
  }

  return items;
}

function normalizeListItem(rawItem: string, options: { stripHash: boolean }): string {
  const text = options.stripHash ? rawItem.trim().replace(/^#+/, "") : rawItem.trim();

  return text;
}

function clampPositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function normalizeSearchText(value: string | null): string {
  return value?.trim() ?? "";
}
