import { prisma } from "@junglebob/db";
import { NextResponse } from "next/server";
import { normalizeMealPhotoUrl } from "@/features/menus/menu-image-url";
import { buildMenuDay, parseMenuDate, todayKstDateText, type MenuDayRow } from "@/features/menus/menu-day";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const dateText = url.searchParams.get("date") ?? todayKstDateText();
    const date = parseMenuDate(dateText);
    const rows = await prisma.menuArchive.findMany({
      where: { date },
      select: {
        id: true,
        mealType: true,
        items: true,
        rawText: true,
        imageUrl: true,
        imageType: true
      }
    });

    const menuRows = rows.map(({ imageType, ...row }) => ({
      ...row,
      imageUrl: normalizeMealPhotoUrl(row.imageUrl, imageType)
    }));

    return NextResponse.json({
      menuDay: buildMenuDay(dateText, menuRows as MenuDayRow[])
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "menu lookup failed";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
