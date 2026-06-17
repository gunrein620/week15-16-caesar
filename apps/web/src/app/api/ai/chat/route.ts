import { prisma } from "@junglebob/db";
import { NextResponse } from "next/server";
import { buildMenuDay, parseMenuDate, todayKstDateText, type MenuDayRow } from "@/features/menus/menu-day";

const OPENAI_CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_CHAT_MODEL = "gpt-4.1-mini";

// 정글밥 몽키 챗봇의 자유 대화 핸들러.
// 규칙으로 못 잡는 질문을 LLM이 오늘 메뉴를 맥락으로 받아 자연스럽게 답한다.
export async function POST(request: Request) {
  let question = "";
  try {
    const body = (await request.json()) as { question?: unknown };
    question = typeof body.question === "string" ? body.question.trim() : "";
  } catch {
    question = "";
  }

  if (!question) {
    return NextResponse.json({ reply: "끼끼? 뭐라고 했어? 다시 물어봐 줘 🐵" });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      reply: "끼끼, 지금은 자유 대화가 꺼져 있어! 그래도 오늘 메뉴나 매운맛은 물어봐도 돼 🐵"
    });
  }

  const today = todayKstDateText();
  const rows = await prisma.menuArchive.findMany({
    where: { date: parseMenuDate(today) },
    select: { id: true, mealType: true, items: true, rawText: true, imageUrl: true }
  });
  const menuDay = buildMenuDay(today, rows as MenuDayRow[]);
  const lunch = menuDay.meals.lunch?.items ?? [];
  const dinner = menuDay.meals.dinner?.items ?? [];

  const model =
    process.env.OPENAI_RECOMMEND_MODEL?.trim() ||
    process.env.OPENAI_VISION_MODEL?.trim() ||
    DEFAULT_CHAT_MODEL;

  try {
    const response = await fetch(OPENAI_CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "너는 '정글밥 몽키'라는 구내식당 도우미 캐릭터야. 원숭이 말투로 '끼끼', '🐵'를 가끔 섞어 친근하고 짧게(2~3문장) 답해. " +
              "사용자의 식사·메뉴 관련 질문에 도움을 줘. 식단 정보 밖의 사실은 모르면 솔직히 모른다고 해. 의학적 단정은 피해. " +
              `오늘은 ${today}이고, 오늘 점심은 [${lunch.join(", ") || "미등록"}], 오늘 저녁은 [${dinner.join(", ") || "미등록"}]이야.`
          },
          { role: "user", content: question }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error(`[ai/chat] OpenAI HTTP ${response.status}: ${errorBody.slice(0, 300)}`);
      return NextResponse.json({ reply: "우끼… 지금 생각이 잘 안 나네. 잠깐 뒤에 다시 물어봐 줘 🐵" });
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = data.choices?.[0]?.message?.content;

    return NextResponse.json({
      reply: typeof reply === "string" && reply.trim() ? reply.trim() : "끼끼? 잘 모르겠어, 다시 물어봐 줘!"
    });
  } catch (error) {
    console.error("[ai/chat] 예외:", error instanceof Error ? error.message : error);
    return NextResponse.json({ reply: "끼익! 연결이 끊겼나 봐. 다시 물어봐 줘 🐵" });
  }
}
