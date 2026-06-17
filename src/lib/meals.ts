import type { MealMenu, MealType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { FeedMealMenu } from "@/types/meal";

const kakaoChannelId = "_xhzNjn";
const kakaoBaseUrl = "https://pf.kakao.com/rocket-web/web/profiles";
const kakaoBrowserUrl = "https://pf.kakao.com";
const kstTimeZone = "Asia/Seoul";

type KakaoContent = {
  t?: string;
  v?: string;
};

type KakaoMedia = {
  url?: string;
  xlarge_url?: string;
  large_url?: string;
  medium_url?: string;
};

type KakaoPost = {
  id?: number | string;
  title?: string;
  permalink?: string;
  published_at?: number;
  created_at?: number;
  updated_at?: number;
  contents?: KakaoContent[];
  media?: KakaoMedia[];
};

type KakaoPostList = {
  items?: KakaoPost[];
};

type MealPostClassification =
  | {
      postType: "WEEKLY_TABLE";
      mealDate: null;
      mealType: null;
    }
  | {
      postType: "DAILY_MENU";
      mealDate: Date;
      mealType: MealType;
    };

export type CrawlResult = {
  storedPostCount: number;
  storedMenuCount: number;
};

export class MealCrawlerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MealCrawlerError";
  }
}

function kakaoJsonHeaders() {
  return {
    Accept: "application/json, text/plain, */*",
    Referer: `${kakaoBrowserUrl}/${kakaoChannelId}/posts`,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
  };
}

async function fetchKakaoJson<T>(path: string): Promise<T> {
  const response = await fetch(`${kakaoBaseUrl}/${kakaoChannelId}${path}`, {
    headers: kakaoJsonHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new MealCrawlerError(`카카오 채널 응답 오류: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new MealCrawlerError("카카오 채널 JSON 응답을 받지 못했습니다.");
  }

  return (await response.json()) as T;
}

function kstDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: kstTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
  };
}

function mealDateFromParts(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function classifyMealPost(title: string, publishedAt: Date): MealPostClassification | null {
  if (/^\s*\d{1,2}월\s*\d{1,2}주차\s*식단표\s*$/.test(title)) {
    return {
      postType: "WEEKLY_TABLE",
      mealDate: null,
      mealType: null,
    };
  }

  const dailyMatch = title.match(
    /^\s*(\d{1,2})월\s*(\d{1,2})일\s*\([^)]*\)\s*(중식|석식)\s*메뉴\s*$/,
  );

  if (!dailyMatch) {
    return null;
  }

  const [, monthValue, dayValue, mealName] = dailyMatch;
  const { year } = kstDateParts(publishedAt);

  return {
    postType: "DAILY_MENU",
    mealDate: mealDateFromParts(year, Number(monthValue), Number(dayValue)),
    mealType: mealName === "중식" ? "LUNCH" : "DINNER",
  };
}

function representativeImage(post: KakaoPost) {
  const image = post.media?.find((item) =>
    Boolean(item.xlarge_url || item.large_url || item.medium_url || item.url),
  );

  return image?.xlarge_url || image?.large_url || image?.medium_url || image?.url || "";
}

function textMenu(post: KakaoPost) {
  return (
    post.contents
      ?.filter((content) => content.t === "text" && typeof content.v === "string")
      .map((content) => content.v?.trim())
      .filter((value): value is string => Boolean(value))
      .join("\n")
      .trim() ?? ""
  );
}

function postTimestamp(post: KakaoPost) {
  return Number(post.published_at ?? post.created_at ?? post.updated_at ?? Date.now());
}

function toInputJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function fetchPostDetail(post: KakaoPost) {
  if (!post.id) {
    return post;
  }

  return fetchKakaoJson<KakaoPost>(`/posts/${post.id}`);
}

export function toFeedMealMenu(menu: MealMenu): FeedMealMenu {
  return {
    id: menu.id,
    mealDate: menu.mealDate.toISOString(),
    mealType: menu.mealType,
    menuText: menu.menuText,
    imageUrl: menu.imageUrl,
  };
}

export async function crawlAndCacheKakaoMeals(): Promise<CrawlResult> {
  const list = await fetchKakaoJson<KakaoPostList>("/posts?includePinnedPost=true");
  const candidates = (list.items ?? []).filter((post) => {
    if (!post.title || !post.id) {
      return false;
    }

    return Boolean(classifyMealPost(post.title, new Date(postTimestamp(post))));
  });

  let storedPostCount = 0;
  let storedMenuCount = 0;

  for (const post of candidates) {
    const detail = await fetchPostDetail(post);
    const title = detail.title ?? post.title ?? "";
    const publishedAt = new Date(postTimestamp(detail));
    const classification = classifyMealPost(title, publishedAt);

    if (!classification || !detail.id) {
      continue;
    }

    const kakaoPostId = String(detail.id);
    const imageUrl = representativeImage(detail);
    const menuText = textMenu(detail);

    const mealPost = await prisma.mealPost.upsert({
      where: {
        kakaoPostId,
      },
      create: {
        kakaoPostId,
        title,
        permalink: detail.permalink ?? `${kakaoBrowserUrl}/${kakaoChannelId}/${kakaoPostId}`,
        imageUrl,
        rawJson: toInputJson(detail),
        postType: classification.postType,
        publishedAt,
        crawledAt: new Date(),
      },
      update: {
        title,
        permalink: detail.permalink ?? `${kakaoBrowserUrl}/${kakaoChannelId}/${kakaoPostId}`,
        imageUrl,
        rawJson: toInputJson(detail),
        postType: classification.postType,
        publishedAt,
        crawledAt: new Date(),
      },
    });
    storedPostCount += 1;

    if (classification.postType === "DAILY_MENU") {
      await prisma.mealMenu.upsert({
        where: {
          mealDate_mealType: {
            mealDate: classification.mealDate,
            mealType: classification.mealType,
          },
        },
        create: {
          mealDate: classification.mealDate,
          mealType: classification.mealType,
          menuText,
          imageUrl,
          sourcePostId: mealPost.id,
        },
        update: {
          menuText,
          imageUrl,
          sourcePostId: mealPost.id,
        },
      });
      storedMenuCount += 1;
    }
  }

  return {
    storedPostCount,
    storedMenuCount,
  };
}

function startOfTodayKst(now = new Date()) {
  const { year, month, day } = kstDateParts(now);
  return mealDateFromParts(year, month, day);
}

function preferredMealTypes(now = new Date()): MealType[] {
  const { hour } = kstDateParts(now);
  return hour < 15 ? ["LUNCH", "DINNER"] : ["DINNER", "LUNCH"];
}

export async function findRecommendedMeal(now = new Date()) {
  const today = startOfTodayKst(now);
  const [primaryType, secondaryType] = preferredMealTypes(now);

  const todayPreferred = await prisma.mealMenu.findUnique({
    where: {
      mealDate_mealType: {
        mealDate: today,
        mealType: primaryType,
      },
    },
  });

  if (todayPreferred) {
    return todayPreferred;
  }

  const todayOther = await prisma.mealMenu.findUnique({
    where: {
      mealDate_mealType: {
        mealDate: today,
        mealType: secondaryType,
      },
    },
  });

  if (todayOther) {
    return todayOther;
  }

  return prisma.mealMenu.findFirst({
    where: {
      mealDate: {
        lte: today,
      },
    },
    orderBy: [
      {
        mealDate: "desc",
      },
      {
        mealType: "desc",
      },
    ],
  });
}
