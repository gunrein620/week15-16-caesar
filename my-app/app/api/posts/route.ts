import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { auth } from "@/auth";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }

  const userResult = await pool.query(
    "SELECT id FROM users WHERE email = $1",
    [session.user.email]
  );
  const userId = userResult.rows[0].id;

  const { title, content } = await request.json();
  const result = await pool.query(
    "INSERT INTO posts (title, content, user_id) VALUES ($1, $2, $3) RETURNING *",
    [title, content, userId]
  );
  return NextResponse.json(result.rows[0]);
}

export async function GET() {
  const result = await pool.query(
    "SELECT * FROM posts ORDER BY created_at DESC"
  );
  return NextResponse.json(result.rows);
}