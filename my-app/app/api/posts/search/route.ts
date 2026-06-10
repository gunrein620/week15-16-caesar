import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json({ error: "검색어를 입력해주세요" }, { status: 400 });
  }

  const result = await pool.query(
    `SELECT * FROM posts
     WHERE title ILIKE $1 OR content ILIKE $1
     ORDER BY created_at DESC`,
    [`%${q}%`]
  );
  return NextResponse.json(result.rows);
}
