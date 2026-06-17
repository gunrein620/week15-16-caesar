import { NextResponse } from "next/server";

import {
  crawlAndCacheKakaoMeals,
  findRecommendedMeal,
  MealCrawlerError,
  toFeedMealMenu,
} from "@/lib/meals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let crawlFailed = false;
  let crawlMessage = "";

  try {
    await crawlAndCacheKakaoMeals();
  } catch (error) {
    crawlFailed = true;
    crawlMessage =
      error instanceof MealCrawlerError
        ? error.message
        : "카카오 채널 식단을 불러오지 못했습니다.";
  }

  try {
    const meal = await findRecommendedMeal();

    if (!meal) {
      return NextResponse.json({
        meal: null,
        source: "empty",
        message: crawlFailed
          ? `${crawlMessage} 아직 캐시된 식단도 없습니다.`
          : "아직 공개된 식단 메뉴가 없습니다.",
      });
    }

    return NextResponse.json({
      meal: toFeedMealMenu(meal),
      source: crawlFailed ? "cache" : "fresh",
      message: crawlFailed
        ? `${crawlMessage} 캐시된 식단을 보여드립니다.`
        : "추천 식단을 불러왔습니다.",
    });
  } catch {
    return NextResponse.json(
      {
        meal: null,
        source: "empty",
        message: crawlFailed
          ? `${crawlMessage} 데이터베이스 캐시도 확인하지 못했습니다.`
          : "식단 캐시를 확인하지 못했습니다.",
      },
      { status: 503 },
    );
  }
}
