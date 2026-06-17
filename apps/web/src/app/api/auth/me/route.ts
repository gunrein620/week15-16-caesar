import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/features/auth/current-user";

export async function GET() {
  const user = await getCurrentUserFromCookies();

  return NextResponse.json({ user });
}
