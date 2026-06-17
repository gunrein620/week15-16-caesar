import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import {
  buildSnackJudgeInputFromContext,
  buildSnackJudgementContext,
} from "@/lib/ai/judgement-context";
import { OpenAIConfigurationError } from "@/lib/ai/openai";
import { generateSnackJudgement } from "@/lib/ai/snack-judgement";
import { authOptions } from "@/lib/auth";
import { toFeedAiJudgement } from "@/lib/posts";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JudgementRequestBody = {
  force?: unknown;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as JudgementRequestBody | null;
  const force = body?.force === true;
  const context = await buildSnackJudgementContext(id);

  if (!context || !context.post.id) {
    return NextResponse.json({ message: "포스트를 찾을 수 없습니다." }, { status: 404 });
  }

  const latestJudgement = await prisma.aiJudgement.findFirst({
    where: {
      postId: context.post.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (latestJudgement && !force) {
    return NextResponse.json({
      judgement: context.latestAiJudgement ?? toFeedAiJudgement(latestJudgement),
      cached: true,
    });
  }

  if (force && context.post.author?.id !== session.user.id) {
    return NextResponse.json(
      { message: "작성자만 AI 재판결을 요청할 수 있습니다." },
      { status: 403 },
    );
  }

  try {
    const generated = await generateSnackJudgement(buildSnackJudgeInputFromContext(context));

    const created = await prisma.aiJudgement.create({
      data: {
        postId: context.post.id,
        modelName: generated.modelName,
        promptVersion: generated.promptVersion,
        verdict: generated.judgement.verdict,
        summary: generated.judgement.summary,
        reasoning: generated.judgement.reasoning,
        rawJson: generated.rawJson,
      },
    });

    return NextResponse.json(
      {
        judgement: toFeedAiJudgement(created),
        cached: false,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof OpenAIConfigurationError) {
      return NextResponse.json(
        {
          code: "OPENAI_NOT_CONFIGURED",
          message: "OPENAI_API_KEY is not configured",
        },
        { status: 503 },
      );
    }

    console.error("AI judgement generation failed", error);
    return NextResponse.json(
      { message: "AI 판결 생성에 실패했습니다." },
      { status: 502 },
    );
  }
}
