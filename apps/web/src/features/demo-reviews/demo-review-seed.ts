import { buildCommentChunkInput, buildReviewChunkInput } from "../rag/chunk.ts";
import { normalizeMenuImageUrl } from "../menus/menu-image.ts";

export type DemoMealType = "LUNCH" | "DINNER";

export type DemoMenuArchive = {
  id: string;
  date: string | Date;
  mealType: DemoMealType;
  items: string[];
  imageUrl: string | null;
};

export type DemoReviewPlan = {
  seedKey: string;
  menuArchiveId: string;
  title: string;
  content: string;
  rating: number;
  imageUrl: string | null;
  menuNames: string[];
  tags: string[];
  comments: string[];
  createdAt: Date;
};

export type DemoReviewSeedMode = "replace" | "append";

export type DemoReviewSeedStore = {
  findMenus(): Promise<DemoMenuArchive[]>;
  upsertSeedUsers(): Promise<{
    reviewers: Array<{ id: string }>;
    commenters: Array<{ id: string }>;
  }>;
  countSeedReviews?(authorIds: string[]): Promise<number>;
  deleteSeedReviews(authorIds: string[]): Promise<number>;
  createReviewSeed(input: {
    plan: DemoReviewPlan;
    reviewerId: string;
    commenterIds: string[];
  }): Promise<{
    reviewId: string;
    commentIds: string[];
    chunkCount: number;
  }>;
};

export type DemoReviewSeedResult = {
  sourceMenuCount: number;
  plannedReviewCount: number;
  deletedReviewCount: number;
  createdReviewCount: number;
  createdCommentCount: number;
  createdChunkCount: number;
};

const DEFAULT_DEMO_REVIEW_LIMIT = 100;
const MAX_MENU_NAMES_PER_REVIEW = 3;

const REVIEW_PATTERNS = [
  {
    rating: 5,
    tags: ["든든함", "재방문의사"],
    title: (primary: string, mealLabel: string) => `${primary} 나온 ${mealLabel}, 꽤 만족`,
    tone: "메인이 확실해서 식사 후 포만감이 좋았습니다.",
    close: "다음에 비슷한 구성으로 나오면 다시 고를 것 같습니다."
  },
  {
    rating: 4,
    tags: ["균형좋음", "무난함"],
    title: (primary: string, mealLabel: string) => `${mealLabel} ${primary} 무난하게 좋았어요`,
    tone: "간이 과하지 않고 반찬 조합이 안정적이라 편하게 먹기 좋았습니다.",
    close: "특별히 튀는 메뉴는 아니었지만 전체적으로 만족스러웠습니다."
  },
  {
    rating: 4,
    tags: ["가성비", "든든함"],
    title: (primary: string) => `${primary} 중심이라 든든했습니다`,
    tone: "바쁜 날 빠르게 먹기 좋은 구성이고 밥 메뉴와 곁들이기 좋았습니다.",
    close: "양도 부족하지 않아서 오후까지 배고프지 않았습니다."
  },
  {
    rating: 3,
    tags: ["무난함", "아쉬움"],
    title: (primary: string) => `${withTopicParticle(primary)} 괜찮았고 반찬은 평범`,
    tone: "전체적으로 무난했지만 한 가지 정도는 더 선명한 맛이 있으면 좋겠습니다.",
    close: "그래도 한 끼로 먹기에는 크게 불편하지 않았습니다."
  },
  {
    rating: 3,
    tags: ["간이강함", "아쉬움"],
    title: (primary: string) => `${primary} 맛은 좋았는데 간이 조금 셌어요`,
    tone: "맛은 괜찮았지만 제 기준에는 간이 조금 강하게 느껴졌습니다.",
    close: "국이나 반찬을 조금 덜 짜게 맞추면 더 자주 먹을 것 같습니다."
  },
  {
    rating: 5,
    tags: ["추천", "만족"],
    title: (primary: string, mealLabel: string) => `${mealLabel} 메뉴 중 ${primary} 기억남`,
    tone: "오늘 메뉴 중 가장 기억에 남는 조합이었습니다.",
    close: "같이 나온 반찬까지 흐름이 좋아서 추천할 만했습니다."
  }
] as const;

export function selectDemoMenus(menus: DemoMenuArchive[], limit = DEFAULT_DEMO_REVIEW_LIMIT): DemoMenuArchive[] {
  const normalizedLimit = Math.max(0, Math.floor(limit));
  const validMenus = menus
    .filter((menu) => isSuitableMenuForReview(menu))
    .sort((left, right) => compareMenusByDate(left, right, "asc"));

  if (normalizedLimit === 0 || validMenus.length === 0) {
    return [];
  }

  if (validMenus.length <= normalizedLimit) {
    return repeatMenus(
      [...validMenus].sort((left, right) => compareMenusByDate(left, right, "desc")),
      normalizedLimit
    );
  }

  const earlyQuota = Math.min(4, Math.ceil(normalizedLimit / 2));
  const recentQuota = normalizedLimit - earlyQuota;
  const newestMenus = [...validMenus].sort((left, right) => compareMenusByDate(left, right, "desc")).slice(0, recentQuota);
  const newestIds = new Set(newestMenus.map((menu) => menu.id));
  const earliestMenus = validMenus.filter((menu) => !newestIds.has(menu.id)).slice(0, normalizedLimit - newestMenus.length);

  return [...newestMenus, ...earliestMenus];
}

export function buildDemoReviewPlans(
  menus: DemoMenuArchive[],
  options: { limit?: number; offset?: number } = {}
): DemoReviewPlan[] {
  const limit = Math.max(0, Math.floor(options.limit ?? DEFAULT_DEMO_REVIEW_LIMIT));
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const occurrenceCounts = new Map<string, number>();
  const titleCounts = new Map<string, number>();

  return selectDemoMenus(menus, limit + offset).map((menu, index) => {
    const dateText = menuDateText(menu.date);
    const mealLabel = formatMealLabel(menu.mealType);
    const primary = menu.items[0] ?? "메뉴";
    const secondary = menu.items[1] ?? "";
    const menuNames = menu.items.slice(0, MAX_MENU_NAMES_PER_REVIEW);
    const occurrence = occurrenceCounts.get(menu.id) ?? 0;
    occurrenceCounts.set(menu.id, occurrence + 1);
    const pattern = REVIEW_PATTERNS[index % REVIEW_PATTERNS.length];
    const tags = uniqueItems([...pattern.tags, mealLabel]);
    const createdAt = reviewCreatedAt(dateText, menu.mealType, index);
    const title = uniqueReviewTitle(pattern.title(primary, mealLabel), primary, mealLabel, titleCounts);

    return {
      seedKey: `${dateText}-${menu.mealType.toLowerCase()}-${occurrence + 1}-${index + 1}`,
      menuArchiveId: menu.id,
      title,
      content: [
        `${dateText} ${mealLabel}에 ${menu.items.join(", ")} 나왔습니다.`,
        pattern.tone,
        secondary ? `${withAndParticle(primary)} ${secondary} 조합이 가장 괜찮았습니다.` : `${primary} 중심으로 먹기 좋은 구성이었습니다.`,
        pattern.close
      ].join("\n"),
      rating: pattern.rating,
      imageUrl: normalizeMenuImageUrl(menu.imageUrl),
      menuNames,
      tags,
      comments: buildDemoComments(primary, secondary, mealLabel, index),
      createdAt
    };
  }).slice(offset);
}

export async function seedDemoReviews(
  store: DemoReviewSeedStore,
  options: { limit?: number; mode?: DemoReviewSeedMode } = {}
): Promise<DemoReviewSeedResult> {
  const mode = options.mode ?? "replace";
  const menus = await store.findMenus();
  const seedUsers = await store.upsertSeedUsers();
  const reviewerIds = seedUsers.reviewers.map((user) => user.id);
  const commenterIds = seedUsers.commenters.map((user) => user.id);
  const deletedReviewCount = mode === "replace" ? await store.deleteSeedReviews(reviewerIds) : 0;
  const offset = mode === "append" ? await (store.countSeedReviews?.(reviewerIds) ?? Promise.resolve(0)) : 0;
  const plans = buildDemoReviewPlans(menus, {
    limit: options.limit,
    offset
  });

  if (plans.length === 0) {
    throw new Error("demo review seed requires at least one menu");
  }

  if (reviewerIds.length === 0 || commenterIds.length === 0) {
    throw new Error("demo review seed requires reviewer and commenter users");
  }

  let createdReviewCount = 0;
  let createdCommentCount = 0;
  let createdChunkCount = 0;

  for (const [index, plan] of plans.entries()) {
    const created = await store.createReviewSeed({
      plan,
      reviewerId: reviewerIds[index % reviewerIds.length],
      commenterIds: plan.comments.map((_, commentIndex) => commenterIds[(index + commentIndex) % commenterIds.length])
    });

    createdReviewCount += 1;
    createdCommentCount += created.commentIds.length;
    createdChunkCount += created.chunkCount;
  }

  return {
    sourceMenuCount: menus.length,
    plannedReviewCount: plans.length,
    deletedReviewCount,
    createdReviewCount,
    createdCommentCount,
    createdChunkCount
  };
}

export function buildReviewSeedChunkData(plan: DemoReviewPlan, reviewId: string) {
  return buildReviewChunkInput({
    reviewId,
    title: plan.title,
    content: plan.content,
    menuNames: plan.menuNames,
    tags: plan.tags
  });
}

export function buildCommentSeedChunkData(input: {
  commentId: string;
  reviewId: string;
  reviewTitle: string;
  content: string;
}) {
  return buildCommentChunkInput(input);
}

function buildDemoComments(primary: string, secondary: string, mealLabel: string, index: number): string[] {
  const comments = [
    `${primary} 나온 날이면 저도 ${mealLabel}으로 골랐을 것 같아요.`,
    secondary ? `저도 먹었는데 ${secondary}까지 같이 있어서 괜찮았습니다.` : "양이 괜찮았는지 궁금하네요.",
    `${mealLabel}에 이 정도 구성이면 꽤 든든했겠네요.`,
    index % 2 === 0 ? "반찬 조합도 크게 튀지 않아서 무난해 보여요." : "다음에 나오면 저도 한 번 먹어보고 싶습니다."
  ];

  return comments.slice(0, 2 + (index % 3));
}

function isSuitableMenuForReview(menu: DemoMenuArchive): boolean {
  const visibleItems = menu.items.slice(0, MAX_MENU_NAMES_PER_REVIEW);
  return visibleItems.length > 0 && visibleItems.every(isSuitableMenuItem);
}

function isSuitableMenuItem(item: string): boolean {
  const text = item.trim();

  if (!text) {
    return false;
  }

  if (text.includes("<") || /^https?:\/\//i.test(text)) {
    return false;
  }

  return hasBalancedParentheses(text);
}

function hasBalancedParentheses(text: string): boolean {
  let depth = 0;

  for (const char of text) {
    if (char === "(") {
      depth += 1;
    }

    if (char === ")") {
      depth -= 1;

      if (depth < 0) {
        return false;
      }
    }
  }

  return depth === 0;
}

function repeatMenus(menus: DemoMenuArchive[], limit: number): DemoMenuArchive[] {
  return Array.from({ length: limit }, (_, index) => menus[index % menus.length]);
}

function uniqueReviewTitle(
  title: string,
  primary: string,
  mealLabel: string,
  titleCounts: Map<string, number>
): string {
  if (!titleCounts.has(title)) {
    titleCounts.set(title, 1);
    return title;
  }

  const variants = [
    `${primary} 다시 나온 ${mealLabel} 후기`,
    `${mealLabel} ${primary}, 이번에도 괜찮았습니다`,
    `${primary} 재등장한 날 기록`,
    `${mealLabel} ${primary} 한 번 더 먹어본 후기`,
    `${primary} 조합 다시 먹어본 날`
  ];

  for (let index = 0; index < variants.length * 4; index += 1) {
    const variant = variants[index % variants.length];
    const candidate = index >= variants.length ? `${variant} ${Math.floor(index / variants.length) + 1}` : variant;

    if (!titleCounts.has(candidate)) {
      titleCounts.set(candidate, 1);
      return candidate;
    }
  }

  const fallback = `${primary} ${mealLabel} 후기 ${titleCounts.size + 1}`;
  titleCounts.set(fallback, 1);
  return fallback;
}

function withAndParticle(text: string): string {
  return `${text}${hasFinalConsonant(text) ? "과" : "와"}`;
}

function withTopicParticle(text: string): string {
  return `${text}${hasFinalConsonant(text) ? "은" : "는"}`;
}

function hasFinalConsonant(text: string): boolean {
  for (let index = text.length - 1; index >= 0; index -= 1) {
    const code = text.charCodeAt(index);

    if (code >= 0xac00 && code <= 0xd7a3) {
      return (code - 0xac00) % 28 !== 0;
    }
  }

  return false;
}

function compareMenusByDate(left: DemoMenuArchive, right: DemoMenuArchive, direction: "asc" | "desc"): number {
  const directionMultiplier = direction === "asc" ? 1 : -1;
  const dateCompare = menuDateText(left.date).localeCompare(menuDateText(right.date));

  if (dateCompare !== 0) {
    return dateCompare * directionMultiplier;
  }

  return (mealSortValue(left.mealType) - mealSortValue(right.mealType)) * directionMultiplier;
}

function mealSortValue(mealType: DemoMealType): number {
  return mealType === "LUNCH" ? 0 : 1;
}

function formatMealLabel(mealType: DemoMealType): string {
  return mealType === "LUNCH" ? "점심" : "저녁";
}

function menuDateText(date: string | Date): string {
  return typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
}

function reviewCreatedAt(dateText: string, mealType: DemoMealType, index: number): Date {
  const baseHour = mealType === "LUNCH" ? 5 : 11;
  const minute = String(20 + (index % 4) * 7).padStart(2, "0");
  return new Date(`${dateText}T${String(baseHour).padStart(2, "0")}:${minute}:00.000Z`);
}

function uniqueItems(items: string[]): string[] {
  return items.filter((item, index) => item && items.indexOf(item) === index);
}
