import { createSessionToken, hashSessionToken, verifyPassword } from "@junglebob/ai";
import { prisma } from "@junglebob/db";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, isSecureCookie } from "@/features/auth/session-cookie";
import { loginUser, type LoginInput } from "@/features/auth/session";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as LoginInput;
    const result = await loginUser(input, {
      findUserByEmail: (email) =>
        prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true
          }
        }),
      verifyPassword,
      createSession: async (data) => {
        await prisma.session.create({ data });
      },
      createSessionToken,
      hashSessionToken,
      now: () => new Date()
    });

    const response = NextResponse.json({ user: result.user });
    response.cookies.set(SESSION_COOKIE_NAME, result.sessionToken, {
      expires: result.expiresAt,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: isSecureCookie(request)
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "login failed";
    const status = message === "email or password is invalid" ? 401 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
