import { prisma } from "@junglebob/db";
import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/features/auth/current-user";
import {
  buildAgentRecommendation,
  normalizeRecommendInput,
  selectRequestedMeal,
  type RagEvidence,
  type RecommendationLevelValue
} from "@/features/agent/recommendation";
import { defaultFoodPreference, type FoodPreferenceData } from "@/features/food-profile/profile";
import {
  buildMenuDay,
  parseMenuDate,
  shiftMenuDate,
  todayKstDateText,
  type MenuDayRow
} from "@/features/menus/menu-day";
import { normalizeMealPhotoUrl } from "@/features/menus/menu-image-url";
import { buildRagFallbackQueries, normalizeRagSearchQuery } from "@/features/rag/chunk";
import { findSemanticRagResults } from "@/features/rag/embedding";

const RAG_RESULT_SELECT = {
  id: true,
  content: true,
  metadata: true,
  createdAt: true,
  review: {
    select: {
      id: true,
      title: true,
      rating: true,
      menuNames: true,
      author: {
        select: {
          name: true
        }
      }
    }
  },
  comment: {
    select: {
      id: true,
      reviewId: true,
      author: {
        select: {
          name: true
        }
      },
      review: {
        select: {
          id: true,
          title: true
        }
      }
    }
  }
} as const;

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const input = normalizeRecommendInput((await request.json()) as Record<string, unknown>);
  const agentRun = await prisma.agentRun.create({
    data: {
      userId: user.id,
      question: input.question
    },
    select: {
      id: true
    }
  });

  try {
    const dateText = input.date ?? dateFromQuestion(input.question) ?? todayKstDateText();
    const menuStep = await runAgentStep(agentRun.id, "get_today_menu", { date: dateText }, async () => {
      const menuRows = await prisma.menuArchive.findMany({
        where: { date: parseMenuDate(dateText) },
        select: {
          id: true,
          mealType: true,
          items: true,
          rawText: true,
          imageUrl: true,
          imageType: true
        }
      });
      const normalizedMenuRows = menuRows.map(({ imageType, ...row }) => ({
        ...row,
        imageUrl: normalizeMealPhotoUrl(row.imageUrl, imageType)
      }));
      const menuDay = buildMenuDay(dateText, normalizedMenuRows as MenuDayRow[]);
      const selectedMeal = selectRequestedMeal(menuDay, input.question, input.mealType);

      return {
        menuDay,
        selectedMeal
      };
    });

    const preference = await runAgentStep(agentRun.id, "get_user_food_profile", { userId: user.id }, async () => {
      const savedPreference = await prisma.foodPreference.findUnique({
        where: { userId: user.id },
        select: {
          allergyFoods: true,
          favoriteFoods: true,
          dislikedFoods: true,
          spicyTolerance: true
        }
      });

      return savedPreference ?? defaultFoodPreference();
    });

    const ragResults = await runAgentStep(
      agentRun.id,
      "search_similar_reviews",
      {
        query: buildRagQuery(menuStep.selectedMeal, input.question),
        limit: 3
      },
      async () => searchRagResults(buildRagQuery(menuStep.selectedMeal, input.question), 3)
    );

    const recommendation = await runAgentStep(
      agentRun.id,
      "generate_final_answer",
      {
        question: input.question,
        selectedMeal: menuStep.selectedMeal,
        preference,
        ragEvidenceCount: ragResults.length
      },
      async () => {
        const base = buildAgentRecommendation({
          question: input.question,
          selectedMeal: menuStep.selectedMeal,
          preference,
          ragResults: ragResults.map((result): RagEvidence => ({ id: result.id, content: result.content }))
        });

        // 안전장치: 알레르기 재료가 있으면 LLM과 무관하게 규칙(AVOID)을 유지한다.
        if (base.matchedAllergies.length > 0) {
          return base;
        }

        // 그 외에는 LLM이 후기 본문을 근거로 직접 판단(RAG). 실패 시 규칙으로 폴백.
        const llm = await judgeWithReviews({
          question: input.question,
          menuItems: base.menuItems,
          preference,
          reviews: ragResults.map((result) => result.content)
        });

        if (!llm) {
          return base;
        }

        return {
          ...base,
          recommendationLevel: llm.recommendationLevel,
          reasons: llm.reasons.length > 0 ? llm.reasons : base.reasons,
          finalMessage: llm.finalMessage || base.finalMessage
        };
      }
    );

    const savedRun = await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: {
        recommendationLevel: recommendation.recommendationLevel,
        finalMessage: recommendation.finalMessage,
        status: "SUCCESS"
      },
      select: {
        id: true,
        status: true,
        recommendationLevel: true,
        finalMessage: true,
        createdAt: true
      }
    });

    return NextResponse.json({
      agentRun: savedRun,
      recommendation,
      menuDay: menuStep.menuDay,
      selectedMeal: menuStep.selectedMeal,
      preference,
      ragResults
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "agent recommend failed";

    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status: "FAILED",
        finalMessage: message
      }
    });

    return NextResponse.json({ error: message, agentRunId: agentRun.id }, { status: 400 });
  }
}

async function runAgentStep<T>(
  agentRunId: string,
  stepName: string,
  input: unknown,
  action: () => Promise<T>
): Promise<T> {
  const step = await prisma.agentStep.create({
    data: {
      agentRunId,
      stepName,
      input: jsonValue(input)
    },
    select: {
      id: true
    }
  });

  try {
    const output = await action();

    await prisma.agentStep.update({
      where: { id: step.id },
      data: {
        status: "SUCCESS",
        output: jsonValue(output)
      }
    });

    return output;
  } catch (error) {
    await prisma.agentStep.update({
      where: { id: step.id },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : "agent step failed"
      }
    });

    throw error;
  }
}

function buildRagQuery(selectedMeal: MenuDayRow | null, question: string): string {
  return selectedMeal?.items[0] ?? question;
}

async function searchRagResults(query: string, limit: number) {
  const input = normalizeRagSearchQuery({ query, limit: String(limit) });
  const semanticResults = await findSemanticRagResults(prisma, input.query, input.limit);

  if (semanticResults) {
    return semanticResults;
  }

  const textResults = await prisma.reviewChunk.findMany({
    where: {
      content: {
        contains: input.query,
        mode: "insensitive"
      }
    },
    orderBy: { createdAt: "desc" },
    take: input.limit,
    select: RAG_RESULT_SELECT
  });

  if (textResults.length > 0) {
    return textResults;
  }

  const fallbackQueries = buildRagFallbackQueries(input.query);

  if (fallbackQueries.length === 0) {
    return textResults;
  }

  return prisma.reviewChunk.findMany({
    where: {
      OR: fallbackQueries.map((query) => ({
        content: {
          contains: query,
          mode: "insensitive" as const
        }
      }))
    },
    orderBy: { createdAt: "desc" },
    take: input.limit,
    select: RAG_RESULT_SELECT
  });
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

const QUESTION_WEEKDAY_MAP: Record<string, number> = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6
};

// 질문 텍스트에서 상대 날짜(오늘/내일/모레/어제)나 요일(수요일 등)을 읽어 YYYY-MM-DD를 만든다.
// 못 찾으면 undefined를 반환해 호출부가 오늘로 폴백한다.
function dateFromQuestion(question: string): string | undefined {
  const t = question.replace(/\s+/g, "");
  const today = todayKstDateText();

  if (/모레/.test(t)) {
    return shiftMenuDate(today, 2);
  }
  if (/내일|낼/.test(t)) {
    return shiftMenuDate(today, 1);
  }
  if (/그저께|그제/.test(t)) {
    return shiftMenuDate(today, -2);
  }
  if (/어제/.test(t)) {
    return shiftMenuDate(today, -1);
  }
  if (/오늘/.test(t)) {
    return today;
  }

  const weekdayMatch = /([월화수목금토일])요일/.exec(t);
  if (weekdayMatch) {
    const target = QUESTION_WEEKDAY_MAP[weekdayMatch[1]];
    const todayDow = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    return shiftMenuDate(today, target - todayDow);
  }

  return undefined;
}

const OPENAI_CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_JUDGE_MODEL = "gpt-4.1-mini";

type LlmJudgement = {
  recommendationLevel: RecommendationLevelValue;
  finalMessage: string;
  reasons: string[];
};

// 검색된 후기(RAG 결과)를 근거로 LLM이 직접 판단한다.
// 키가 없거나 실패하면 null을 반환해 규칙 기반으로 폴백한다.
async function judgeWithReviews(params: {
  question: string;
  menuItems: string[];
  preference: FoodPreferenceData;
  reviews: string[];
}): Promise<LlmJudgement | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey || params.menuItems.length === 0) {
    return null;
  }

  const model =
    process.env.OPENAI_RECOMMEND_MODEL?.trim() ||
    process.env.OPENAI_VISION_MODEL?.trim() ||
    DEFAULT_JUDGE_MODEL;

  const reviewText =
    params.reviews.length > 0 ? params.reviews.map((content, index) => `${index + 1}. ${content}`).join("\n") : "(관련 후기 없음)";

  const userPrompt = [
    `오늘 메뉴: ${params.menuItems.join(", ")}`,
    `사용자 알레르기: ${params.preference.allergyFoods.join(", ") || "없음"}`,
    `사용자가 싫어하는 음식: ${params.preference.dislikedFoods.join(", ") || "없음"}`,
    `사용자가 좋아하는 음식: ${params.preference.favoriteFoods.join(", ") || "없음"}`,
    `매운맛 정도: ${params.preference.spicyTolerance}`,
    `사용자 질문: ${params.question || "오늘 메뉴 나한테 괜찮아?"}`,
    "",
    "다른 사람들의 후기:",
    reviewText
  ].join("\n");

  try {
    const response = await fetch(OPENAI_CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "너는 구내식당 메뉴가 이 사용자에게 괜찮은지 판단하는 정글밥 도우미야. " +
              "사용자의 알레르기·취향과 '다른 사람들의 후기'를 함께 근거로 삼아 판단해. " +
              "특히 후기 내용(맛·양·호불호)을 판단에 반드시 반영하고, reasons에는 어떤 후기 때문에 그렇게 판단했는지 적어. " +
              "알레르기 재료가 메뉴에 있으면 무조건 AVOID. " +
              '반드시 다음 JSON으로만 답해: {"recommendationLevel":"GOOD|CAUTION|AVOID","finalMessage":"한국어 한두 문장, 친근한 말투","reasons":["근거1","근거2"]}'
          },
          { role: "user", content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error(`[judgeWithReviews] OpenAI HTTP ${response.status}: ${errorBody.slice(0, 300)}`);
      return null;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content;

    if (typeof text !== "string") {
      return null;
    }

    const parsed = JSON.parse(text) as {
      recommendationLevel?: unknown;
      finalMessage?: unknown;
      reasons?: unknown;
    };
    const level = parsed.recommendationLevel;

    if (level !== "GOOD" && level !== "CAUTION" && level !== "AVOID") {
      return null;
    }

    return {
      recommendationLevel: level,
      finalMessage: typeof parsed.finalMessage === "string" ? parsed.finalMessage : "",
      reasons: Array.isArray(parsed.reasons)
        ? parsed.reasons.filter((reason): reason is string => typeof reason === "string")
        : []
    };
  } catch (error) {
    console.error("[judgeWithReviews] 예외:", error instanceof Error ? error.message : error);
    return null;
  }
}

// 내 최근 진단(AgentRun) 기록을 반환한다.
export async function GET() {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const runs = await prisma.agentRun.findMany({
    where: { userId: user.id, recommendationLevel: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      question: true,
      recommendationLevel: true,
      finalMessage: true,
      status: true,
      createdAt: true
    }
  });

  return NextResponse.json({ runs });
}
