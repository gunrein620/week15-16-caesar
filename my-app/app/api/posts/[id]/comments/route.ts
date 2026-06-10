import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { auth } from "@/auth";

export async function GET(_request: Request, ctx: RouteContext<"/api/posts/[id]/comments">) {
  const { id } = await ctx.params;

  const result = await pool.query(
    `SELECT comments.id, comments.content, comments.created_at, users.email AS author
     FROM comments
     JOIN users ON comments.user_id = users.id
     WHERE comments.post_id = $1
     ORDER BY comments.created_at ASC`,
    [id]
  );
  return NextResponse.json(result.rows);
}

export async function POST(request: Request, ctx: RouteContext<"/api/posts/[id]/comments">) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const userResult = await pool.query(
    "SELECT id FROM users WHERE email = $1",
    [session.user.email]
  );
  if (userResult.rows.length === 0) {
    return NextResponse.json({ error: "사용자를 찾을 수 없음" }, { status: 404 });
  }
  const userId = userResult.rows[0].id;

  const { content } = await request.json();
  if (!content?.trim()) { //trim() : 문자열 앞뒤 공백 제거
    return NextResponse.json({ error: "내용을 입력해주세요" }, { status: 400 });
  }

  const result = await pool.query(
    "INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3) RETURNING *",
    [id, userId, content]
  );
  return NextResponse.json(result.rows[0], { status: 201 });
}
