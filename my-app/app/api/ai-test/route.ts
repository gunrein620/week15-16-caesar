import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI();

export async function GET() {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "한 문장으로 안녕이라고 해줘" }],
  });
  return NextResponse.json({ message: response.choices[0].message.content });
}