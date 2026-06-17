import { prisma } from "@junglebob/db";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// 후기 '도움돼요' 카운트를 1 증가시키고 새 값을 반환한다.
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const review = await prisma.review.update({
      where: { id },
      data: { helpfulCount: { increment: 1 } },
      select: { helpfulCount: true }
    });

    return NextResponse.json({ helpfulCount: review.helpfulCount });
  } catch {
    return NextResponse.json({ error: "review not found" }, { status: 404 });
  }
}
