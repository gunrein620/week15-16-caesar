import { prisma } from "@junglebob/db";
import { NextResponse } from "next/server";
import { buildTopRatedMenus } from "@/features/reviews/top-rated";
import { parseMenuDate, todayKstDateText } from "@/features/menus/menu-day";

// 특정 날짜의 메뉴 항목에 대한 평균 별점·후기 수만 집계해 반환한다.
// (전체 후기를 매번 집계하지 않고, 그날 메뉴를 언급한 후기만 조회해 효율적)
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const dateText = url.searchParams.get("date") ?? todayKstDateText();
    const date = parseMenuDate(dateText);

    const menuRows = await prisma.menuArchive.findMany({
      where: { date },
      select: { items: true }
    });
    const menuItems = [...new Set(menuRows.flatMap((row) => row.items))];

    if (menuItems.length === 0) {
      return NextResponse.json({ ratings: {} });
    }

    const reviews = await prisma.review.findMany({
      where: { menuNames: { hasSome: menuItems } },
      select: { rating: true, menuNames: true }
    });

    const aggregated = buildTopRatedMenus(reviews, { limit: Number.MAX_SAFE_INTEGER });
    const ratings: Record<string, { average: number; count: number }> = {};

    for (const entry of aggregated) {
      // 그날 메뉴에 실제로 있는 항목만 남긴다.
      if (menuItems.includes(entry.menu)) {
        ratings[entry.menu] = { average: entry.averageRating, count: entry.reviewCount };
      }
    }

    return NextResponse.json({ ratings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "menu ratings lookup failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
