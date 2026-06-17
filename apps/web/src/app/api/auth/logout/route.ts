import { hashSessionToken } from "@junglebob/ai";
import { prisma } from "@junglebob/db";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, isSecureCookie } from "@/features/auth/session-cookie";
import { logoutUser } from "@/features/auth/session";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  await logoutUser(sessionToken, {
    hashSessionToken,
    deleteSessionByTokenHash: async (tokenHash) => {
      await prisma.session.deleteMany({
        where: { tokenHash }
      });
    }
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: isSecureCookie(request)
  });

  return response;
}
