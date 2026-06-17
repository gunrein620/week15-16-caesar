import { hashPassword } from "@junglebob/ai";
import { prisma } from "@junglebob/db";
import { NextResponse } from "next/server";
import { signupUser, type SignupInput } from "@/features/auth/signup";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as SignupInput;

    const user = await signupUser(input, {
      findUserByEmail: (email) =>
        prisma.user.findUnique({
          where: { email },
          select: { id: true }
        }),
      createUser: (data) =>
        prisma.user.create({
          data,
          select: {
            id: true,
            email: true,
            name: true
          }
        }),
      hashPassword
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "회원가입 처리 중 오류가 발생했습니다.";
    const status = message === "이미 가입된 이메일입니다." ? 409 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
