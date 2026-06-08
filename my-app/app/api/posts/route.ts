import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function POST(request: Request) {
  const { title, content } = await request.json();
  const result = await pool.query(
    "INSERT INTO posts (title, content) VALUES ($1, $2) RETURNING *",
    [title, content]
  );
  return NextResponse.json(result.rows[0]);
}

export async function GET() {
  const result = await pool.query(
    "SELECT * FROM posts ORDER BY created_at DESC"
  );
  return NextResponse.json(result.rows);
}