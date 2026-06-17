import { prisma } from "@junglebob/db";
import { collectSlackMealRawFromEnv } from "./slack-meal-collector.ts";

export type McpToolName =
  | "import_slack_menu_history"
  | "fetch_kakao_weekly_menu_image"
  | "extract_menu_image_urls"
  | "sync_weekly_menu"
  | "sync_daily_menu_image"
  | "extract_menu_from_image"
  | "get_food_poisoning_risk";

export type McpToolDefinition = {
  name: McpToolName;
  description: string;
};

export type ToolDependencies = {
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  logStore?: McpToolLogStore;
  menuArchiveStore?: MenuArchiveStore;
};

export type McpToolLogStore = {
  create(input: { toolName: string; input: unknown }): Promise<{ id: string }>;
  update(
    id: string,
    data: {
      status: "SUCCESS" | "FAILED";
      output?: unknown;
      error?: string;
    }
  ): Promise<void>;
};

export type VisionOcrRequestOptions = {
  apiKey: string;
  imageUrl: string;
  model: string;
};

export type FoodPoisoningRiskRequestOptions = {
  apiKey?: string;
  date?: string;
  endpoint: string;
  region?: string;
};

export type DailyMenuMealType = "LUNCH" | "DINNER";
export type MenuImageType = "WEEKLY_SHEET" | "MEAL_PHOTO" | "NONE";

export type DailyMenuImageUpsertInput = {
  date: string;
  imageHash: string | null;
  imageType: MenuImageType;
  imageUrl: string | null;
  items: string[];
  mealType: DailyMenuMealType;
  rawText: string | null;
  sourceId: string | null;
  syncedAt: Date;
  // true면 기존 행의 이미지(imageUrl/imageHash)를 덮어쓰지 않고 보존한다.
  // 주간 동기화처럼 텍스트만 갱신하고 끼니별 사진은 유지해야 할 때 사용.
  preserveExistingImage?: boolean;
};

export type MenuArchiveStore = {
  hasWeeklyMenuText?(weekStart: string): Promise<boolean>;
  upsertDailyMenuImage(input: DailyMenuImageUpsertInput): Promise<unknown>;
};

export type KakaoMealPostTitle = {
  day: number;
  mealType: DailyMenuMealType;
  month: number;
  weekday: string;
};

export type KakaoDailyPost = {
  contents?: unknown;
  id?: string | number;
  imageUrl?: string;
  image_url?: string;
  media?: unknown;
  post_id?: string | number;
  text?: string;
  title?: string;
  [key: string]: unknown;
};

const WEEKLY_DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const WEEKLY_MEAL_KEYS = [
  { mealKey: "lunch", mealType: "LUNCH" },
  { mealKey: "dinner", mealType: "DINNER" }
] as const;

export type WeeklyDayKey = (typeof WEEKLY_DAY_KEYS)[number];
export type WeeklyMealKey = "lunch" | "dinner";

export type WeeklyMenuPayload = {
  week_start: string;
  menus: Record<WeeklyDayKey, Record<WeeklyMealKey, string[]>>;
};

export type BuildWeeklyMenuArchiveInputsOptions = {
  imageUrl: string | null;
  sourceIdPrefix?: string;
  syncedAt: Date;
};

const DEFAULT_OPENAI_VISION_MODEL = "gpt-4.1-mini";
const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const MENU_OCR_PROMPT = "정글밥 식단표 이미지에서 날짜, 점심, 저녁 메뉴를 OCR로 추출해 한국어 텍스트로 정리해줘.";
const WEEKLY_MENU_OCR_PROMPT =
  "이미지는 한국어 주간 식단표입니다. 월요일부터 토요일까지의 점심과 저녁 메뉴만 JSON으로 반환하세요. " +
  "첫 번째 식사 행은 lunch, 두 번째 식사 행은 dinner입니다. " +
  "반환 형식은 {\"week_start\":\"YYYY-MM-DD\",\"menus\":{\"monday\":{\"lunch\":[],\"dinner\":[]},\"tuesday\":{\"lunch\":[],\"dinner\":[]},\"wednesday\":{\"lunch\":[],\"dinner\":[]},\"thursday\":{\"lunch\":[],\"dinner\":[]},\"friday\":{\"lunch\":[],\"dinner\":[]},\"saturday\":{\"lunch\":[],\"dinner\":[]}}} 입니다.";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const KST_WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const DAILY_MEAL_SOURCE_LABELS: Record<DailyMenuMealType, string> = {
  DINNER: "석식",
  LUNCH: "중식"
};

const DEFAULT_MENU_ARCHIVE_STORE: MenuArchiveStore = {
  async hasWeeklyMenuText(weekStart) {
    const start = new Date(`${weekStart}T00:00:00.000Z`);
    const end = new Date(`${dateTextFromWeekStart(weekStart, WEEKLY_DAY_KEYS.length - 1)}T00:00:00.000Z`);
    const expectedRows = WEEKLY_DAY_KEYS.length * WEEKLY_MEAL_KEYS.length;
    const count = await prisma.menuArchive.count({
      where: {
        date: {
          gte: start,
          lte: end
        },
        items: {
          isEmpty: false
        }
      }
    });

    return count >= expectedRows;
  },
  async upsertDailyMenuImage(input) {
    const date = new Date(`${input.date}T00:00:00.000Z`);

    // 이미지 보존 모드면 update에서 imageUrl/imageHash를 제외해 기존 사진을 유지한다.
    const imageUpdate = input.preserveExistingImage
      ? {}
      : { imageHash: input.imageHash, imageType: input.imageType, imageUrl: input.imageUrl };

    return prisma.menuArchive.upsert({
      where: {
        date_mealType: {
          date,
          mealType: input.mealType
        }
      },
      update: {
        ...imageUpdate,
        items: input.items,
        rawText: input.rawText,
        sourceId: input.sourceId,
        sourceType: "KAKAO",
        syncedAt: input.syncedAt
      },
      create: {
        date,
        imageHash: input.imageHash,
        imageType: input.imageType,
        imageUrl: input.imageUrl,
        items: input.items,
        mealType: input.mealType,
        rawText: input.rawText,
        sourceId: input.sourceId,
        sourceType: "KAKAO",
        syncedAt: input.syncedAt
      }
    });
  }
};

export const TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: "import_slack_menu_history",
    description: "Slack 채널에서 식단 관련 메시지와 이미지를 수집한다."
  },
  {
    name: "fetch_kakao_weekly_menu_image",
    description: "카카오 채널 식단 게시글을 조회하고 식단 이미지 URL을 추출한다."
  },
  {
    name: "extract_menu_image_urls",
    description: "HTML에서 식단 이미지 후보 URL을 추출한다."
  },
  {
    name: "sync_weekly_menu",
    description: "카카오 주간 식단표 이미지 OCR 결과를 MenuArchive에 동기화한다."
  },
  {
    name: "sync_daily_menu_image",
    description: "현재 시간대에 맞는 카카오 중식/석식 게시글 이미지를 MenuArchive에 동기화한다."
  },
  {
    name: "extract_menu_from_image",
    description: "OpenAI Vision으로 식단 이미지의 OCR 텍스트를 추출한다."
  },
  {
    name: "get_food_poisoning_risk",
    description: "외부 식중독 위험도 API를 조회한다."
  }
];

export async function runLoggedMcpTool(
  toolName: string,
  params: unknown,
  dependencies: ToolDependencies = {}
): Promise<unknown> {
  const log = await dependencies.logStore?.create({
    toolName,
    input: params ?? null
  });

  try {
    const output = await runMcpTool(toolName, params, dependencies);

    if (log) {
      await dependencies.logStore?.update(log.id, {
        status: "SUCCESS",
        output
      });
    }

    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP tool failed";

    if (log) {
      await dependencies.logStore?.update(log.id, {
        status: "FAILED",
        error: message
      });
    }

    throw error;
  }
}

export async function runMcpTool(
  toolName: string,
  params: unknown,
  dependencies: ToolDependencies = {}
): Promise<unknown> {
  if (!isMcpToolName(toolName)) {
    throw new Error(`unknown tool: ${toolName}`);
  }

  const env = dependencies.env ?? process.env;
  const fetcher = dependencies.fetcher ?? fetch;

  switch (toolName) {
    case "import_slack_menu_history":
      return collectSlackMealRawFromEnv(env as NodeJS.ProcessEnv, normalizeRecord(params));
    case "fetch_kakao_weekly_menu_image":
      return fetchKakaoWeeklyMenuImage(params, env, fetcher);
    case "extract_menu_image_urls":
      return extractMenuImageUrlsTool(params);
    case "extract_menu_from_image":
      return extractMenuFromImage(params, env, fetcher);
    case "get_food_poisoning_risk":
      return getFoodPoisoningRisk(params, env, fetcher);
    case "sync_daily_menu_image":
      return syncDailyMenuImage(params, env, fetcher, dependencies.menuArchiveStore ?? DEFAULT_MENU_ARCHIVE_STORE);
    case "sync_weekly_menu":
      return syncWeeklyMenu(params, env, fetcher, dependencies.menuArchiveStore ?? DEFAULT_MENU_ARCHIVE_STORE);
  }
}

export function dailyMenuImageMealTypesToCheck(now: Date): DailyMenuMealType[] {
  const parts = kstParts(now);

  if (parts.weekday === "일") {
    return [];
  }

  const minutes = parts.hour * 60 + parts.minute;

  // 창을 넓게 둬서 스케줄러가 절전 등으로 늦게(보충) 실행돼도 그날 끼니를 잡게 한다.
  // 점심 11:00~13:30, 저녁 17:00~19:30.
  if (11 * 60 <= minutes && minutes <= 13 * 60 + 30) {
    return ["LUNCH"];
  }

  if (17 * 60 <= minutes && minutes <= 19 * 60 + 30) {
    return ["DINNER"];
  }

  return [];
}

export function parseKakaoMealPostTitle(title: string): KakaoMealPostTitle | null {
  const match = /(?<month>\d{1,2})\s*월\s*(?<day>\d{1,2})\s*일\s*\(\s*(?<weekday>[월화수목금토일])\s*\)\s*(?<meal>중식|석식)\s*메뉴/.exec(
    title
  );

  if (!match?.groups) {
    return null;
  }

  return {
    day: Number(match.groups.day),
    mealType: match.groups.meal === "중식" ? "LUNCH" : "DINNER",
    month: Number(match.groups.month),
    weekday: match.groups.weekday
  };
}

export function findKakaoDailyMealPost(
  posts: unknown[],
  target: Date,
  mealType: DailyMenuMealType
): KakaoDailyPost | null {
  const targetParts = kstParts(target);
  const targetMealLabel = DAILY_MEAL_SOURCE_LABELS[mealType];

  for (const rawPost of posts) {
    if (!isRecord(rawPost)) {
      continue;
    }

    const post = rawPost as KakaoDailyPost;
    const title = stringParam(post.title);

    if (!title) {
      continue;
    }

    const parsed = parseKakaoMealPostTitle(title);

    if (
      parsed &&
      parsed.month === targetParts.month &&
      parsed.day === targetParts.day &&
      parsed.weekday === targetParts.weekday &&
      DAILY_MEAL_SOURCE_LABELS[parsed.mealType] === targetMealLabel
    ) {
      return post;
    }
  }

  return null;
}

export function parseWeeklyMenuOutputText(text: string): WeeklyMenuPayload {
  const object = parseJsonObject(text);

  if (!object) {
    throw new Error("weekly menu OCR output did not include a JSON object");
  }

  return normalizeWeeklyMenuPayload(object);
}

export function buildWeeklyMenuArchiveInputs(
  payload: unknown,
  options: BuildWeeklyMenuArchiveInputsOptions
): DailyMenuImageUpsertInput[] {
  const weeklyMenu = normalizeWeeklyMenuPayload(payload);
  const sourceIdPrefix = options.sourceIdPrefix ?? `weekly:${weeklyMenu.week_start}`;
  const inputs: DailyMenuImageUpsertInput[] = [];

  WEEKLY_DAY_KEYS.forEach((dayKey, dayIndex) => {
    const menuForDay = weeklyMenu.menus[dayKey];
    const date = dateTextFromWeekStart(weeklyMenu.week_start, dayIndex);

    for (const { mealKey, mealType } of WEEKLY_MEAL_KEYS) {
      const items = menuForDay[mealKey];

      if (items.length === 0) {
        continue;
      }

      inputs.push({
        date,
        imageHash: null,
        // 주간표 이미지는 끼니별 사진이 아니므로 넣지 않는다.
        // 기존에 저장된 끼니별 이미지(슬랙/당일 수집분)는 preserveExistingImage로 보존한다.
        imageType: "NONE",
        imageUrl: null,
        preserveExistingImage: true,
        items,
        mealType,
        rawText: items.join(", "),
        sourceId: `${sourceIdPrefix}:${dayKey}:${mealType}`,
        syncedAt: options.syncedAt
      });
    }
  });

  return inputs;
}

export function extractImageUrlsFromHtml(html: string, baseUrl?: string): string[] {
  const candidates = [
    ...matchAttributeValues(html, /<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["'][^>]*>/gi),
    ...matchAttributeValues(html, /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi),
    ...matchAttributeValues(html, /<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi)
  ];
  const urls: string[] = [];

  for (const candidate of candidates) {
    const absoluteUrl = toAbsoluteUrl(candidate, baseUrl);

    if (absoluteUrl && !urls.includes(absoluteUrl)) {
      urls.push(absoluteUrl);
    }
  }

  return urls;
}

export function buildVisionOcrRequest(options: VisionOcrRequestOptions): {
  init: RequestInit;
  url: string;
} {
  return {
    url: OPENAI_RESPONSES_ENDPOINT,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: options.model,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: MENU_OCR_PROMPT
              },
              {
                type: "input_image",
                image_url: options.imageUrl,
                detail: "high"
              }
            ]
          }
        ]
      })
    }
  };
}

function buildWeeklyMenuVisionRequest(options: VisionOcrRequestOptions): {
  init: RequestInit;
  url: string;
} {
  const request = buildVisionOcrRequest(options);
  const body = JSON.parse(String(request.init.body)) as Record<string, unknown>;

  if (Array.isArray(body.input) && isRecord(body.input[0]) && Array.isArray(body.input[0].content)) {
    const firstContent = body.input[0].content[0];

    if (isRecord(firstContent)) {
      firstContent.text = WEEKLY_MENU_OCR_PROMPT;
    }
  }

  return {
    url: request.url,
    init: {
      ...request.init,
      body: JSON.stringify(body)
    }
  };
}

export function parseOpenAiOutputText(payload: unknown): string {
  if (isRecord(payload) && typeof payload.output_text === "string") {
    return payload.output_text;
  }

  if (isRecord(payload) && Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (!isRecord(item) || !Array.isArray(item.content)) {
        continue;
      }

      for (const content of item.content) {
        if (isRecord(content) && typeof content.text === "string") {
          return content.text;
        }
      }
    }
  }

  throw new Error("OpenAI vision response did not include output text");
}

export function buildFoodPoisoningRiskRequest(options: FoodPoisoningRiskRequestOptions): {
  init: RequestInit;
  url: string;
} {
  const url = new URL(options.endpoint);

  if (options.date) {
    url.searchParams.set("date", options.date);
  }

  if (options.region) {
    url.searchParams.set("region", options.region);
  }

  return {
    url: url.toString(),
    init: {
      method: "GET",
      headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}
    }
  };
}

async function fetchKakaoWeeklyMenuImage(
  params: unknown,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch
): Promise<unknown> {
  const input = normalizeRecord(params);
  const postUrl = stringParam(input.postUrl) ?? env.KAKAO_WEEKLY_MENU_POST_URL?.trim();

  if (!postUrl) {
    return {
      ok: false,
      status: "unavailable",
      reason: "KAKAO_WEEKLY_MENU_POST_URL is not configured"
    };
  }

  const response = await fetcher(postUrl);

  if (!response.ok) {
    throw new Error(`Kakao post fetch failed: HTTP ${response.status}`);
  }

  const imageUrls = extractImageUrlsFromHtml(await response.text(), postUrl);

  return {
    ok: true,
    postUrl,
    imageUrls,
    imageUrl: imageUrls[0] ?? null
  };
}

async function syncWeeklyMenu(
  params: unknown,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch,
  menuArchiveStore: MenuArchiveStore
): Promise<unknown> {
  const input = normalizeRecord(params);
  const now = dateParam(input.now) ?? new Date();
  const expectedWeekStart = weekStartDateTextFromKstDate(now);
  const force = booleanParam(input.force);

  if (!force && !input.weeklyMenu && (await menuArchiveStore.hasWeeklyMenuText?.(expectedWeekStart))) {
    return {
      ok: true,
      reason: "weekly menu already synced",
      skipped: true,
      status: "skipped",
      synced: [],
      syncedCount: 0,
      weekStart: expectedWeekStart
    };
  }

  const imageUrl = await resolveWeeklyMenuImageUrl(input, env, fetcher);

  if (!imageUrl) {
    return {
      ok: false,
      status: "unavailable",
      reason: "weekly menu image URL is not configured"
    };
  }

  if (!input.weeklyMenu && !env.OPENAI_API_KEY?.trim()) {
    return {
      ok: false,
      status: "unavailable",
      reason: "OPENAI_API_KEY is not configured"
    };
  }

  const weeklyMenu = input.weeklyMenu
    ? normalizeWeeklyMenuPayload(input.weeklyMenu)
    : await extractWeeklyMenuFromImage(imageUrl, env, fetcher);

  // OCR이 채운 연도를 현재 기준으로 보정한다(이미지에 연도가 없을 때 오류 방지).
  weeklyMenu.week_start = correctWeekStartYear(weeklyMenu.week_start, now);

  const sourceIdPrefix = stringParam(input.sourceIdPrefix) ?? `weekly:${weeklyMenu.week_start}`;
  const upsertInputs = buildWeeklyMenuArchiveInputs(weeklyMenu, {
    imageUrl,
    sourceIdPrefix,
    syncedAt: now
  });

  for (const upsertInput of upsertInputs) {
    await menuArchiveStore.upsertDailyMenuImage(upsertInput);
  }

  return {
    imageUrl,
    ok: true,
    synced: upsertInputs.map((upsertInput) => ({
      date: upsertInput.date,
      items: upsertInput.items,
      mealType: upsertInput.mealType,
      sourceId: upsertInput.sourceId
    })),
    syncedCount: upsertInputs.length,
    weekStart: weeklyMenu.week_start
  };
}

async function resolveWeeklyMenuImageUrl(
  input: Record<string, unknown>,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch
): Promise<string | null> {
  const configuredImageUrl = stringParam(input.imageUrl) ?? env.KAKAO_WEEKLY_MENU_IMAGE_URL?.trim();

  if (configuredImageUrl) {
    return kakaoImageUrlCandidates(configuredImageUrl)[0] ?? secureUrl(configuredImageUrl);
  }

  const requestedPostUrl = stringParam(input.postUrl);

  if (requestedPostUrl) {
    return resolveKakaoPostImageUrlFromHtml(requestedPostUrl, fetcher);
  }

  const latestWeeklyImageUrl = await resolveLatestKakaoWeeklyMenuImageUrl(input, env, fetcher);

  if (latestWeeklyImageUrl) {
    return latestWeeklyImageUrl;
  }

  const postUrl = env.KAKAO_WEEKLY_MENU_POST_URL?.trim();

  return postUrl ? resolveKakaoPostImageUrlFromHtml(postUrl, fetcher) : null;
}

async function resolveKakaoPostImageUrlFromHtml(postUrl: string, fetcher: typeof fetch): Promise<string | null> {
  const response = await fetcher(postUrl);

  if (!response.ok) {
    throw new Error(`Kakao post fetch failed: HTTP ${response.status}`);
  }

  const imageUrls = extractImageUrlsFromHtml(await response.text(), postUrl);
  const firstImageUrl = imageUrls[0];

  return firstImageUrl ? kakaoImageUrlCandidates(firstImageUrl)[0] ?? secureUrl(firstImageUrl) : null;
}

async function resolveLatestKakaoWeeklyMenuImageUrl(
  input: Record<string, unknown>,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch
): Promise<string | null> {
  const posts = await resolveKakaoDailyPosts(input, env, fetcher);

  if (!posts) {
    return null;
  }

  for (const post of posts) {
    if (!isKakaoWeeklyMenuPost(post)) {
      continue;
    }

    const imageUrl = extractKakaoPostImageUrl(post);

    if (imageUrl) {
      return imageUrl;
    }
  }

  return null;
}

function isKakaoWeeklyMenuPost(post: KakaoDailyPost): boolean {
  const title = stringParam(post.title) ?? "";

  return title.includes("식단표") || /weekly/i.test(title);
}

async function extractWeeklyMenuFromImage(
  imageUrl: string,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch
): Promise<WeeklyMenuPayload> {
  const apiKey = env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const request = buildWeeklyMenuVisionRequest({
    apiKey,
    imageUrl,
    model: env.OPENAI_VISION_MODEL?.trim() || env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_VISION_MODEL
  });
  const response = await fetcher(request.url, request.init);

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `OpenAI weekly menu OCR failed: HTTP ${response.status} ${errorBody.slice(0, 500)}`
    );
  }

  return parseWeeklyMenuOutputText(parseOpenAiOutputText(await response.json()));
}

async function syncDailyMenuImage(
  params: unknown,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch,
  menuArchiveStore: MenuArchiveStore
): Promise<unknown> {
  const input = normalizeRecord(params);
  const now = dateParam(input.now) ?? new Date();
  const requestedMealType = mealTypeParam(input.mealType);
  const force = booleanParam(input.force);
  const checkedMealTypes = requestedMealType
    ? [requestedMealType]
    : force
      ? (["LUNCH", "DINNER"] as DailyMenuMealType[])
      : dailyMenuImageMealTypesToCheck(now);

  if (checkedMealTypes.length === 0) {
    return {
      ok: false,
      status: "unavailable",
      reason: "outside daily Kakao meal image check window",
      checkedMealTypes
    };
  }

  const posts = await resolveKakaoDailyPosts(input, env, fetcher);

  if (!posts) {
    return {
      ok: false,
      status: "unavailable",
      reason: "KAKAO_CHANNEL_PROFILE_ID is not configured"
    };
  }

  const profileId = stringParam(input.profileId) ?? env.KAKAO_CHANNEL_PROFILE_ID?.trim() ?? null;
  const date = kstDateText(now);
  const found: DailyMenuMealType[] = [];
  const skipped: DailyMenuMealType[] = [];
  const synced: Array<{
    date: string;
    imageUrl: string | null;
    items: string[];
    mealType: DailyMenuMealType;
    sourceId: string | null;
    title: string;
  }> = [];

  for (const mealType of checkedMealTypes) {
    const post = findKakaoDailyMealPost(posts, now, mealType);

    if (!post) {
      skipped.push(mealType);
      continue;
    }

    const title = stringParam(post.title) ?? `${date} ${DAILY_MEAL_SOURCE_LABELS[mealType]} 메뉴`;
    const rawText = extractKakaoPostText(post);
    const items = menuItemsFromKakaoText(rawText);
    const imageUrl = extractKakaoPostImageUrl(post);
    const sourceId = extractKakaoPostId(post);

    await menuArchiveStore.upsertDailyMenuImage({
      date,
      imageHash: null,
      imageType: imageUrl ? "MEAL_PHOTO" : "NONE",
      imageUrl,
      items,
      mealType,
      rawText: rawText || null,
      sourceId,
      syncedAt: now
    });

    found.push(mealType);
    synced.push({
      date,
      imageUrl,
      items,
      mealType,
      sourceId,
      title
    });
  }

  return {
    checkedMealTypes,
    found,
    ok: true,
    profileId,
    skipped,
    synced
  };
}

async function resolveKakaoDailyPosts(
  input: Record<string, unknown>,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch
): Promise<KakaoDailyPost[] | null> {
  if (Array.isArray(input.posts)) {
    return input.posts.filter(isRecord) as KakaoDailyPost[];
  }

  const profileId = stringParam(input.profileId) ?? env.KAKAO_CHANNEL_PROFILE_ID?.trim();

  if (!profileId) {
    return null;
  }

  const response = await fetcher(kakaoPostsUrl(profileId));

  if (!response.ok) {
    throw new Error(`Kakao posts fetch failed: HTTP ${response.status}`);
  }

  const payload = await response.json();

  if (isRecord(payload) && Array.isArray(payload.items)) {
    return payload.items.filter(isRecord) as KakaoDailyPost[];
  }

  return [];
}

function kakaoPostsUrl(profileId: string): string {
  return `https://pf.kakao.com/rocket-web/web/profiles/${encodeURIComponent(profileId)}/posts?includePinnedPost=true`;
}

function extractKakaoPostText(post: KakaoDailyPost): string {
  const text = stringParam(post.text);

  if (text) {
    return text;
  }

  if (!Array.isArray(post.contents)) {
    return "";
  }

  const parts: string[] = [];

  for (const item of post.contents) {
    if (isRecord(item)) {
      const value = stringParam(item.v);

      if (value) {
        parts.push(value);
      }
    }
  }

  return parts.join("\n").trim();
}

function menuItemsFromKakaoText(text: string): string[] {
  const items: string[] = [];
  const textWithoutTags = text.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ");
  const chunks = textWithoutTags.split(/[\n,]/);

  for (const chunk of chunks) {
    const item = chunk
      .replace(/^[*\-\u2022\s]+/, "")
      .replace(/\s+/g, " ")
      .trim();

    if (item && !items.includes(item)) {
      items.push(item);
    }
  }

  return items;
}

function extractKakaoPostImageUrl(post: KakaoDailyPost): string | null {
  const cachedUrl = stringParam(post.imageUrl) ?? stringParam(post.image_url);

  if (cachedUrl) {
    return kakaoImageUrlCandidates(cachedUrl)[0] ?? secureUrl(cachedUrl);
  }

  if (!Array.isArray(post.media)) {
    return null;
  }

  for (const item of post.media) {
    if (!isRecord(item)) {
      continue;
    }

    const url =
      stringParam(item.xlarge_url) ??
      stringParam(item.url) ??
      stringParam(item.large_url) ??
      stringParam(item.medium_url);

    if (url) {
      return kakaoImageUrlCandidates(url)[0] ?? secureUrl(url);
    }
  }

  return null;
}

function extractKakaoPostId(post: KakaoDailyPost): string | null {
  const id = post.id ?? post.post_id;

  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

function kakaoImageUrlCandidates(url: string): string[] {
  const secured = secureUrl(url.trim());

  if (!secured) {
    return [];
  }

  const candidates = [secured.replace(/\/img_[a-z]+(?=\.)/i, "/img_xl"), secured];
  const unique: string[] = [];

  for (const candidate of candidates) {
    if (candidate && !unique.includes(candidate)) {
      unique.push(candidate);
    }
  }

  return unique;
}

function secureUrl(url: string): string {
  return url.startsWith("http://") ? `https://${url.slice("http://".length)}` : url;
}

function extractMenuImageUrlsTool(params: unknown): unknown {
  const input = normalizeRecord(params);
  const html = stringParam(input.html);

  if (!html) {
    throw new Error("html is required");
  }

  const imageUrls = extractImageUrlsFromHtml(html, stringParam(input.baseUrl));

  return {
    ok: true,
    imageUrls,
    imageUrl: imageUrls[0] ?? null
  };
}

async function extractMenuFromImage(
  params: unknown,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch
): Promise<unknown> {
  const input = normalizeRecord(params);
  const imageUrl = stringParam(input.imageUrl);
  const apiKey = env.OPENAI_API_KEY?.trim();

  if (!imageUrl) {
    throw new Error("imageUrl is required");
  }

  if (!apiKey) {
    return {
      ok: false,
      status: "unavailable",
      reason: "OPENAI_API_KEY is not configured"
    };
  }

  const request = buildVisionOcrRequest({
    apiKey,
    imageUrl,
    model: env.OPENAI_VISION_MODEL?.trim() || env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_VISION_MODEL
  });
  const response = await fetcher(request.url, request.init);

  if (!response.ok) {
    throw new Error(`OpenAI vision OCR failed: HTTP ${response.status}`);
  }

  return {
    ok: true,
    imageUrl,
    rawText: parseOpenAiOutputText(await response.json())
  };
}

async function getFoodPoisoningRisk(
  params: unknown,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch
): Promise<unknown> {
  const input = normalizeRecord(params);
  const endpoint = env.FOOD_POISONING_RISK_API_URL?.trim();

  if (!endpoint) {
    return {
      ok: false,
      status: "unavailable",
      reason: "FOOD_POISONING_RISK_API_URL is not configured"
    };
  }

  const request = buildFoodPoisoningRiskRequest({
    endpoint,
    apiKey: env.FOOD_SAFETY_API_KEY?.trim(),
    date: stringParam(input.date),
    region: stringParam(input.region)
  });
  const response = await fetcher(request.url, request.init);

  if (!response.ok) {
    throw new Error(`Food poisoning risk API failed: HTTP ${response.status}`);
  }

  return {
    ok: true,
    risk: await response.json()
  };
}

function isMcpToolName(value: string): value is McpToolName {
  return TOOL_DEFINITIONS.some((tool) => tool.name === value);
}

function normalizeWeeklyMenuPayload(value: unknown): WeeklyMenuPayload {
  if (!isRecord(value)) {
    throw new Error("weekly menu payload must be an object");
  }

  const weekStart = stringParam(value.week_start);

  if (!weekStart || !isDateText(weekStart)) {
    throw new Error("weekly menu payload must include week_start as YYYY-MM-DD");
  }

  const rawMenus = isRecord(value.menus) ? value.menus : {};
  const menus = {} as WeeklyMenuPayload["menus"];

  for (const dayKey of WEEKLY_DAY_KEYS) {
    const rawDay = isRecord(rawMenus[dayKey]) ? rawMenus[dayKey] : {};

    menus[dayKey] = {
      dinner: normalizeWeeklyMenuItems(rawDay.dinner),
      lunch: normalizeWeeklyMenuItems(rawDay.lunch)
    };
  }

  return {
    week_start: weekStart,
    menus
  };
}

function normalizeWeeklyMenuItems(value: unknown): string[] {
  const items: string[] = [];
  const addItem = (item: string) => {
    if (item && !items.includes(item)) {
      items.push(item);
    }
  };

  if (typeof value === "string") {
    for (const item of menuItemsFromKakaoText(value)) {
      addItem(item);
    }

    return items;
  }

  if (!Array.isArray(value)) {
    return items;
  }

  for (const rawItem of value) {
    if (typeof rawItem !== "string") {
      continue;
    }

    for (const item of menuItemsFromKakaoText(rawItem)) {
      addItem(item);
    }
  }

  return items;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const fencedJsonMatch = /```(?:json)?\s*(?<json>[\s\S]*?)\s*```/i.exec(text);
  const candidate = fencedJsonMatch?.groups?.json ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start < 0 || end < start) {
    return null;
  }

  const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;

  return isRecord(parsed) ? parsed : null;
}

// 주간 식단표 이미지에는 연도가 없어 OCR이 연도를 틀리게 채우는 경우가 많다.
// 월·일은 신뢰하되 연도는 now 기준으로 가장 가까운 해로 보정한다.
function correctWeekStartYear(weekStart: string, now: Date): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStart);

  if (!match) {
    return weekStart;
  }

  const month = match[2];
  const day = match[3];
  const nowYear = now.getUTCFullYear();
  const candidates = [nowYear - 1, nowYear, nowYear + 1];

  let best = weekStart;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const year of candidates) {
    const candidate = `${year}-${month}-${day}`;
    const time = new Date(`${candidate}T00:00:00.000Z`).getTime();

    if (Number.isNaN(time)) {
      continue;
    }

    const distance = Math.abs(time - now.getTime());

    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}

function dateTextFromWeekStart(weekStart: string, offsetDays: number): string {
  const date = new Date(`${weekStart}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("week_start is invalid");
  }

  date.setUTCDate(date.getUTCDate() + offsetDays);

  return date.toISOString().slice(0, 10);
}

function isDateText(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  return dateTextFromWeekStart(value, 0) === value;
}

function matchAttributeValues(html: string, pattern: RegExp): string[] {
  return [...html.matchAll(pattern)].map((match) => match[1]).filter((value): value is string => Boolean(value));
}

function toAbsoluteUrl(value: string, baseUrl?: string): string | null {
  try {
    return baseUrl ? new URL(value, baseUrl).toString() : new URL(value).toString();
  } catch {
    return null;
  }
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function booleanParam(value: unknown): boolean {
  return value === true || value === "true";
}

function dateParam(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error("date parameter must be an ISO date string");
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("date parameter is invalid");
  }

  return date;
}

function mealTypeParam(value: unknown): DailyMenuMealType | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value === "LUNCH" || value === "DINNER") {
    return value;
  }

  throw new Error("mealType must be LUNCH or DINNER");
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function kstParts(date: Date): {
  day: number;
  hour: number;
  minute: number;
  month: number;
  weekday: string;
  year: number;
} {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);

  return {
    day: kst.getUTCDate(),
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
    month: kst.getUTCMonth() + 1,
    weekday: KST_WEEKDAY_LABELS[kst.getUTCDay()] ?? "",
    year: kst.getUTCFullYear()
  };
}

function kstDateText(date: Date): string {
  const parts = kstParts(date);

  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function weekStartDateTextFromKstDate(date: Date): string {
  const dateText = kstDateText(date);
  const calendarDate = new Date(`${dateText}T00:00:00.000Z`);
  const dayOfWeek = calendarDate.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  return dateTextFromWeekStart(dateText, mondayOffset);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
