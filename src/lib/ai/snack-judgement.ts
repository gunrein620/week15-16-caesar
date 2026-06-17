import type { Prisma } from "@/generated/prisma/client";
import { getOpenAIClient, getOpenAIModel } from "@/lib/ai/openai";
import {
  buildSnackJudgeInput,
  parseSnackJudgeOutput,
  snackJudgeResponseFormat,
  SNACK_JUDGE_INSTRUCTIONS,
  SNACK_JUDGE_PROMPT_VERSION,
  type SnackJudgeInput,
  type SnackJudgeOutput,
} from "@/lib/ai/prompts/snack-judge";

export type GeneratedSnackJudgement = {
  judgement: SnackJudgeOutput;
  modelName: string;
  promptVersion: string;
  rawJson: Prisma.InputJsonValue;
};

export async function generateSnackJudgement(
  input: SnackJudgeInput,
): Promise<GeneratedSnackJudgement> {
  const client = getOpenAIClient();
  const modelName = getOpenAIModel();
  const response = await client.responses.create({
    model: modelName,
    instructions: SNACK_JUDGE_INSTRUCTIONS,
    input: buildSnackJudgeInput(input),
    text: {
      format: snackJudgeResponseFormat,
    },
  });

  const outputText = response.output_text?.trim();
  if (!outputText) {
    throw new Error("AI judgement response was empty.");
  }

  const judgement = parseSnackJudgeOutput(outputText);

  return {
    judgement,
    modelName,
    promptVersion: SNACK_JUDGE_PROMPT_VERSION,
    rawJson: toInputJson({
      ...judgement,
      contextVersion: input.contextVersion,
      evidenceSummary: input.contextEvidenceSummary,
      usedPrecedents: input.precedents.map((precedent) => ({
        postId: precedent.postId,
        snackName: precedent.snackName,
        similarityScore: precedent.similarityScore,
        similaritySignals: precedent.similaritySignals,
        voteCounts: precedent.voteCounts,
        conclusion: precedent.conclusion,
      })),
      usedExternalRag: input.externalRagContexts.map((context) => ({
        documentId: context.documentId,
        title: context.title,
        sourceUrl: context.sourceUrl,
        publisher: context.publisher,
        category: context.category,
        relevanceScore: context.relevanceScore,
      })),
      usedMealContext: {
        attachedMealContext: input.mealContext,
        currentRecommendedMeal: input.currentRecommendedMeal,
      },
      usedVoteSummary: input.voteSummary,
      precedentRag: input.precedents,
      externalSnackRag: input.externalRagContexts,
      ragPolicy: {
        internalPrecedentsFirst: true,
        externalFallbackOnly: input.precedents.length < 3,
      },
    }),
  };
}

function toInputJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
