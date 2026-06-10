// PATCH /api/me — 프로필 설정(닉네임·동네) = 회원가입 마지막 단계
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const nickname = typeof body?.nickname === "string" ? body.nickname.trim() : "";
  const town = typeof body?.town === "string" ? body.town.trim() : "";
  if (!nickname) return NextResponse.json({ error: "nickname required" }, { status: 400 });

  const taken = await prisma.user.findFirst({
    where: { nickname, id: { not: session.user.id } },
  });
  if (taken) return NextResponse.json({ error: "nickname taken" }, { status: 409 });

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { nickname, town: town || null },
  });
  return NextResponse.json({ id: user.id, nickname: user.nickname, town: user.town });
}
