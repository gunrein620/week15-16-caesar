import type { Prisma } from "@/generated/prisma/client";
import {
  EXTERNAL_SNACK_RAG_SOURCE_TYPE,
  type ExternalSnackRagSource,
} from "@/lib/ai/external-rag-sources";
import { prisma } from "@/lib/prisma";

const MIN_INTERNAL_PRECEDENTS = 3;
const DEFAULT_EXTERNAL_CONTEXT_LIMIT = 4;
const MIN_TOKEN_LENGTH = 2;

const koreanConceptMap = [
  {
    match: ["운동", "헬스", "근력", "유산소", "운동후", "운동전", "단백질", "프로틴"],
    add: ["workout", "fitness", "exercise", "protein", "recovery", "carbohydrate"],
  },
  {
    match: ["다이어트", "감량", "식단", "관리", "저칼로리"],
    add: ["diet", "weight management", "snack quality", "portion", "satiety"],
  },
  {
    match: ["당", "당충전", "초코", "초콜릿", "달달", "디저트", "아이스크림"],
    add: ["sweet craving", "stable energy", "natural sweetness", "low sugar"],
  },
  {
    match: ["배고픔", "허기", "점심패스", "저녁패스", "식사패스", "야식"],
    add: ["hunger", "meal gap", "snack bridge", "planned snack", "energy"],
  },
  {
    match: ["정당", "정당방위", "사유", "변명", "합리화", "무죄"],
    add: ["planned snack", "snack quality", "portion", "mindful eating"],
  },
  {
    match: ["스트레스", "야근", "밤샘", "코딩", "디버깅", "시험"],
    add: ["stress", "mindful eating", "energy dip", "social snacking"],
  },
];

export type ExternalSnackRagContext = {
  documentId: string;
  title: string;
  sourceUrl: string;
  publisher: string;
  category: ExternalSnackRagSource["category"] | string;
  tags: string[];
  relevanceScore: number;
  content: string;
};

export function shouldUseExternalSnackRag(internalPrecedentCount: number) {
  return internalPrecedentCount < MIN_INTERNAL_PRECEDENTS;
}

export async function findExternalSnackRagContexts(input: {
  snackName: string;
  reason: string;
  tags: string[];
  limit?: number;
}): Promise<ExternalSnackRagContext[]> {
  const limit = input.limit ?? DEFAULT_EXTERNAL_CONTEXT_LIMIT;
  const queryTokens = expandQueryTokens(
    tokenize([input.snackName, input.reason, ...input.tags].join(" ")),
  );

  const documents = await prisma.ragDocument.findMany({
    where: {
      sourceType: EXTERNAL_SNACK_RAG_SOURCE_TYPE,
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 80,
  });

  const ranked = documents
    .map((document) => toExternalContext(document, queryTokens))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
  const matched = ranked.filter((context) => context.relevanceScore > 0);
  const contexts =
    matched.length > 0
      ? matched
      : ranked.map((context) => ({
          ...context,
          relevanceScore: 1,
        }));

  return contexts.slice(0, limit);
}

function toExternalContext(
  document: {
    id: string;
    title: string;
    content: string;
    metadata: Prisma.JsonValue;
  },
  queryTokens: string[],
): ExternalSnackRagContext {
  const metadata = readMetadata(document.metadata);
  const titleTokens = tokenize(document.title);
  const contentTokens = tokenize(document.content);
  const tagTokens = tokenize(metadata.tags.join(" "));
  const titleHits = intersection(queryTokens, titleTokens).length;
  const contentHits = intersection(queryTokens, contentTokens).length;
  const tagHits = intersection(queryTokens, tagTokens).length;
  const categoryHits = queryTokens.includes(metadata.category.toLowerCase()) ? 1 : 0;
  const relevanceScore = tagHits * 6 + titleHits * 4 + contentHits * 2 + categoryHits * 3;

  return {
    documentId: document.id,
    title: document.title,
    sourceUrl: metadata.sourceUrl,
    publisher: metadata.publisher,
    category: metadata.category,
    tags: metadata.tags,
    relevanceScore,
    content: document.content,
  };
}

function readMetadata(value: Prisma.JsonValue) {
  const object =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, Prisma.JsonValue>)
      : {};
  const tags = Array.isArray(object.tags)
    ? object.tags.filter((tag): tag is string => typeof tag === "string")
    : [];

  return {
    sourceUrl: typeof object.sourceUrl === "string" ? object.sourceUrl : "",
    publisher: typeof object.publisher === "string" ? object.publisher : "",
    category: typeof object.category === "string" ? object.category : "",
    tags,
  };
}

function expandQueryTokens(tokens: string[]) {
  const expanded = new Set(tokens);
  const joined = tokens.join(" ");

  for (const concept of koreanConceptMap) {
    if (concept.match.some((keyword) => joined.includes(keyword.toLowerCase()))) {
      for (const token of concept.add) {
        tokenize(token).forEach((expandedToken) => expanded.add(expandedToken));
      }
    }
  }

  return Array.from(expanded);
}

function tokenize(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}#]+/gu, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= MIN_TOKEN_LENGTH),
    ),
  );
}

function intersection(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}
