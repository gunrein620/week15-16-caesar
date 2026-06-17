import { prisma } from "@junglebob/db";
import { NextResponse } from "next/server";
import { parseMenuDate, todayKstDateText } from "@/features/menus/menu-day";

// 특정 날짜의 메뉴 항목을 언급한 과거 후기를 반환한다.
// /menus 식단 카드 아래 "이 메뉴 후기 모아보기"에 사용.
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
      return NextResponse.json({ reviews: [] });
    }

    const reviews = await prisma.review.findMany({
      where: { menuNames: { hasSome: menuItems } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        rating: true,
        menuNames: true,
        author: { select: { name: true } }
      }
    });

    return NextResponse.json({ reviews });
  } catch (error) {
    const message = error instanceof Error ? error.message : "menu reviews lookup failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
