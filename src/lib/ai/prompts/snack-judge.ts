import type { ResponseFormatTextJSONSchemaConfig } from "openai/resources/responses/responses";

export const SNACK_JUDGE_PROMPT_VERSION = "snack-judge-v2";

export const snackAiVerdicts = [
  "INNOCENT",
  "PROBATION",
  "GUILTY_BUT_UNDERSTANDABLE",
  "NEEDS_MORE_CONTEXT",
] as const;

export type SnackJudgeVerdict = (typeof snackAiVerdicts)[number];

export type SnackJudgeOutput = {
  verdict: SnackJudgeVerdict;
  title: string;
  summary: string;
  reasoning: string;
  recommendation: string;
  confidence: number;
  precedentFindings: Array<{
    postId: string;
    source: "COMMUNITY_VOTE" | "AI_JUDGEMENT" | "AI_INFERRED" | "NOT_USED";
    verdict: SnackJudgeVerdict | null;
    influence: string;
  }>;
};

export type SnackJudgeInput = {
  contextVersion: string;
  contextSummary: string;
  contextEvidenceSummary: string[];
  postId: string | null;
  postCreatedAt: string | null;
  snackName: string;
  reason: string;
  ateLunch: boolean;
  ateDinner: boolean;
  authorName: string;
  tags: string[];
  imageCount: number;
  imageEvidence: Array<{
    id: string;
    storageType: string;
    sourceUrl: string | null;
    altText: string | null;
    width: number | null;
    height: number | null;
    sortOrder: number;
  }>;
  mealContext: {
    ateLunch: boolean;
    ateDinner: boolean;
    lunchMenu: string | null;
    dinnerMenu: string | null;
  } | null;
  currentRecommendedMeal: string | null;
  voteCounts: Record<string, number>;
  voteSummary: {
    voteCounts: Record<string, number>;
    totalVotes: number;
    leadingVote: {
      type: string;
      count: number;
    } | null;
  };
  highlightComments: Array<{
    content: string;
    likeCount: number;
  }>;
  latestAiJudgement: {
    verdict: string;
    summary: string;
    reasoning: string;
    createdAt: string;
  } | null;
  precedents: Array<{
    postId: string;
    snackName: string;
    reason: string;
    tags: string[];
    ateLunch: boolean;
    ateDinner: boolean;
    createdAt: string;
    similarityScore: number;
    similaritySignals: string[];
    voteCounts: Record<string, number>;
    conclusion: {
      source: "COMMUNITY_VOTE" | "AI_JUDGEMENT" | "UNRESOLVED_AI_SHOULD_INFER";
      verdict: string | null;
      confidence: number | null;
      note: string;
    };
  }>;
  externalRagContexts: Array<{
    documentId: string;
    title: string;
    sourceUrl: string;
    publisher: string;
    category: string;
    tags: string[];
    relevanceScore: number;
    content: string;
  }>;
};

export const SNACK_JUDGE_INSTRUCTIONS = [
  "You are the judge of '정글 간식 재판소', a playful Korean snack court for Krafton Jungle students.",
  "Return only valid JSON that matches the schema. Do not wrap it in Markdown.",
  "Keep the tone warm, witty, concise, and empathetic.",
  "Do not shame the user. Do not trigger guilt around calories, body weight, dieting, or appearance.",
  "Do not make medical, nutritional, or health claims. This is entertainment and social context, not health advice.",
  "Consider meal context, whether the student ate lunch or dinner, snack reason, tags, image count, votes, and highlight comments.",
  "The contextSummary field is the shared judgement context package used by both the app API and MCP tools. Treat it as the source of evidence.",
  "Treat votes and comments as social signals, not absolute truth.",
  "Use precedents as retrieval augmented context. Review similar older cases from the 판례 archive before deciding the current post.",
  "If a precedent conclusion source is COMMUNITY_VOTE, reflect that community result first unless the current facts clearly differ.",
  "If a precedent conclusion source is AI_JUDGEMENT, treat it as useful but weaker than community votes.",
  "If a precedent conclusion source is UNRESOLVED_AI_SHOULD_INFER, first infer the likely precedent outcome from its facts, then use that inferred result cautiously for the current judgement.",
  "Use externalRagContexts only when internal precedents are sparse. They are general snack, diet, craving, and workout context, not site precedents.",
  "Do not put externalRagContexts in precedentFindings. Mention external context briefly in reasoning only when it helps explain a thin precedent situation.",
  "For each relevant precedent, write a structured precedentFindings item. Use source AI_INFERRED when you inferred an unresolved precedent's outcome.",
  "Mention precedent influence briefly in reasoning when it materially affects the verdict.",
  "If context is thin or contradictory, prefer NEEDS_MORE_CONTEXT.",
].join("\n");

export const snackJudgeResponseFormat = {
  type: "json_schema",
  name: "snack_judgement",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "verdict",
      "title",
      "summary",
      "reasoning",
      "recommendation",
      "confidence",
      "precedentFindings",
    ],
    properties: {
      verdict: {
        type: "string",
        enum: snackAiVerdicts,
      },
      title: {
        type: "string",
      },
      summary: {
        type: "string",
      },
      reasoning: {
        type: "string",
      },
      recommendation: {
        type: "string",
      },
      confidence: {
        type: "number",
      },
      precedentFindings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["postId", "source", "verdict", "influence"],
          properties: {
            postId: {
              type: "string",
            },
            source: {
              type: "string",
              enum: ["COMMUNITY_VOTE", "AI_JUDGEMENT", "AI_INFERRED", "NOT_USED"],
            },
            verdict: {
              anyOf: [
                {
                  type: "string",
                  enum: snackAiVerdicts,
                },
                {
                  type: "null",
                },
              ],
            },
            influence: {
              type: "string",
            },
          },
        },
      },
    },
  },
} satisfies ResponseFormatTextJSONSchemaConfig;

export function buildSnackJudgeInput(input: SnackJudgeInput) {
  return [
    "Create a snack judgement in Korean for this post.",
    "Use verdict values only from the allowed enum.",
    "Precedents are already filtered to similar older cases from the site 판례 archive and must be considered before external context.",
    "External RAG contexts are fallback learning material from public web sources and should be used only if precedents are insufficient.",
    "Do not simply copy a precedent verdict; compare factual similarity, meal context, votes, tags, and comments.",
    "Input JSON:",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

export function parseSnackJudgeOutput(value: string): SnackJudgeOutput {
  const parsed = JSON.parse(value) as Partial<SnackJudgeOutput>;

  if (!snackAiVerdicts.includes(parsed.verdict as SnackJudgeVerdict)) {
    throw new Error("AI judgement response has an invalid verdict.");
  }

  const title = readRequiredString(parsed.title, "title");
  const summary = readRequiredString(parsed.summary, "summary");
  const reasoning = readRequiredString(parsed.reasoning, "reasoning");
  const recommendation = readRequiredString(parsed.recommendation, "recommendation");
  const precedentFindings = readPrecedentFindings(parsed.precedentFindings);
  const confidence =
    typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.min(Math.max(parsed.confidence, 0), 1)
      : 0;

  return {
    verdict: parsed.verdict as SnackJudgeVerdict,
    title,
    summary,
    reasoning,
    recommendation,
    confidence,
    precedentFindings,
  };
}

function readRequiredString(value: unknown, key: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`AI judgement response is missing ${key}.`);
  }

  return value.trim();
}

function readPrecedentFindings(value: unknown): SnackJudgeOutput["precedentFindings"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const source = candidate.source;
      const verdict = candidate.verdict;

      if (
        source !== "COMMUNITY_VOTE" &&
        source !== "AI_JUDGEMENT" &&
        source !== "AI_INFERRED" &&
        source !== "NOT_USED"
      ) {
        return null;
      }

      if (verdict !== null && !snackAiVerdicts.includes(verdict as SnackJudgeVerdict)) {
        return null;
      }

      return {
        postId: typeof candidate.postId === "string" ? candidate.postId : "",
        source,
        verdict: verdict as SnackJudgeVerdict | null,
        influence: typeof candidate.influence === "string" ? candidate.influence : "",
      };
    })
    .filter((item): item is SnackJudgeOutput["precedentFindings"][number] => Boolean(item));
}
