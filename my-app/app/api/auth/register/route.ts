import { NextResponse } from "next/server";
import pool from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  const { email, password } = await request.json();

  const hashedPassword = await bcrypt.hash(password, 10); // 10은 work factor. 해시 연산을 몇번이나 반복할지

  const result = await pool.query(
    "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email",
    [email, hashedPassword]
  );

  return NextResponse.json(result.rows[0]);
}