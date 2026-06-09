import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { auth } from "@/auth";

export async function PUT(request: Request, ctx: RouteContext<"/api/posts/[id]">) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const postResult = await pool.query(
    "SELECT posts.id FROM posts JOIN users ON posts.user_id = users.id WHERE posts.id = $1 AND users.email = $2",
    [id, session.user.email]
  );
  if (postResult.rows.length === 0) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const { title, content } = await request.json();
  const result = await pool.query(
    "UPDATE posts SET title = $1, content = $2 WHERE id = $3 RETURNING *",
    [title, content, id]
  );
  return NextResponse.json(result.rows[0]);
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/posts/[id]">) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const postResult = await pool.query(
    "SELECT posts.id FROM posts JOIN users ON posts.user_id = users.id WHERE posts.id = $1 AND users.email = $2",
    [id, session.user.email]
  );
  if (postResult.rows.length === 0) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  await pool.query("DELETE FROM posts WHERE id = $1", [id]);
  return new Response(null, { status: 204 });
}
