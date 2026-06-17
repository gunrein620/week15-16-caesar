import type { MealMenu, PostImageStorageType } from "@/generated/prisma/client";
import {
  findExternalSnackRagContexts,
  shouldUseExternalSnackRag,
  type ExternalSnackRagContext,
} from "@/lib/ai/external-rag";
import { findSimilarPrecedents, type PrecedentRagCase } from "@/lib/ai/precedent-rag";
import { findRecommendedMeal } from "@/lib/meals";
import { emptyVoteCounts, toFeedAiJudgement } from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import type { FeedAiJudgement, FeedAuthor, SnackVoteType, VoteCounts } from "@/types/post";
import { voteTypes } from "@/types/post";

export const SNACK_JUDGEMENT_CONTEXT_VERSION = "snack-judgement-context-v1";

const DEFAULT_EXTERNAL_RAG_LIMIT = 4;

type BuildContextOptions = {
  externalRagLimit?: number;
  forceExternalRag?: boolean;
  includeExternalRag?: boolean;
};

export type SnackJudgementInputDraft = {
  snackName: string;
  reason: string;
  tags?: string[];
};

export type JudgementMealMenu = {
  id: string;
  mealDate: string;
  mealType: "LUNCH" | "DINNER";
  menuText: string;
  imageUrl: string;
};

export type JudgementImageMeta = {
  id: string;
  url: string;
  filename: string;
  storageType: PostImageStorageType;
  sourceUrl: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  sortOrder: number;
};

export type JudgementHighlightComment = {
  id: string;
  content: string;
  createdAt: string;
  author: FeedAuthor;
  likeCount: number;
};

export type SnackJudgementContext = {
  contextVersion: typeof SNACK_JUDGEMENT_CONTEXT_VERSION;
  source: "post" | "input";
  post: {
    id: string | null;
    snackName: string;
    reason: string;
    ateLunch: boolean;
    ateDinner: boolean;
    status: string | null;
    visibility: string | null;
    createdAt: string | null;
    author: FeedAuthor | null;
    tags: string[];
    imageCount: number;
    images: JudgementImageMeta[];
  };
  mealContext: {
    ateLunch: boolean;
    ateDinner: boolean;
    mealNote: string | null;
    lunchMenu: JudgementMealMenu | null;
    dinnerMenu: JudgementMealMenu | null;
  } | null;
  voteSummary: {
    voteCounts: VoteCounts;
    totalVotes: number;
    leadingVote: {
      type: SnackVoteType;
      count: number;
    } | null;
  };
  highlightComments: JudgementHighlightComment[];
  latestAiJudgement: FeedAiJudgement | null;
  similarPrecedents: PrecedentRagCase[];
  externalRagContexts: ExternalSnackRagContext[];
  currentRecommendedMeal: JudgementMealMenu | null;
  ragPolicy: {
    internalPrecedentsFirst: true;
    minInternalPrecedents: number;
    externalRagNeeded: boolean;
    externalRagUsed: boolean;
    forcedExternalRag: boolean;
  };
  evidenceSummary: string[];
};

type SnackJudgementContextWithoutSummary = Omit<SnackJudgementContext, "evidenceSummary">;
type PostForPrecedentSearch = Parameters<typeof findSimilarPrecedents>[0];

export async function buildSnackJudgementContext(
  postId: string,
  options: BuildContextOptions = {},
): Promise<SnackJudgementContext | null> {
  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      status: "PUBLISHED",
      visibility: "PUBLIC",
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
      images: {
        orderBy: {
          sortOrder: "asc",
        },
      },
      tags: {
        include: {
          tag: true,
        },
      },
      mealContext: {
        include: {
          lunchMenu: true,
          dinnerMenu: true,
        },
      },
      votes: {
        select: {
          type: true,
        },
      },
      comments: {
        where: {
          status: "PUBLISHED",
        },
        orderBy: [
          {
            likes: {
              _count: "desc",
            },
          },
          {
            createdAt: "desc",
          },
        ],
        take: 2,
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          _count: {
            select: {
              likes: true,
            },
          },
        },
      },
      aiJudgements: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
  });

  if (!post) {
    return null;
  }

  const tags = post.tags.map((postTag) => postTag.tag.name);
  const precedentTarget: PostForPrecedentSearch = {
    id: post.id,
    snackName: post.snackName,
    reason: post.reason,
    createdAt: post.createdAt,
    tags: post.tags,
  };
  const [similarPrecedents, currentRecommendedMeal] = await Promise.all([
    findSimilarPrecedents(precedentTarget),
    getCurrentRecommendedMealContext(),
  ]);
  const externalRagContexts = await maybeFindExternalRagContexts(
    {
      snackName: post.snackName,
      reason: post.reason,
      tags,
    },
    similarPrecedents.length,
    options,
  );
  const voteCounts = countVotes(post.votes.map((vote) => vote.type as SnackVoteType));
  const mealContext = post.mealContext
    ? {
        ateLunch: post.mealContext.ateLunch,
        ateDinner: post.mealContext.ateDinner,
        mealNote: post.mealContext.mealNote,
        lunchMenu: serializeMealMenu(post.mealContext.lunchMenu),
        dinnerMenu: serializeMealMenu(post.mealContext.dinnerMenu),
      }
    : null;
  const contextWithoutSummary = {
    contextVersion: SNACK_JUDGEMENT_CONTEXT_VERSION,
    source: "post" as const,
    post: {
      id: post.id,
      snackName: post.snackName,
      reason: post.reason,
      ateLunch: post.ateLunch,
      ateDinner: post.ateDinner,
      status: post.status,
      visibility: post.visibility,
      createdAt: post.createdAt.toISOString(),
      author: post.author,
      tags,
      imageCount: post.images.length,
      images: post.images.map((image) => ({
        id: image.id,
        url: image.url,
        filename: image.filename,
        storageType: image.storageType,
        sourceUrl: image.sourceUrl,
        altText: image.altText,
        width: image.width,
        height: image.height,
        sortOrder: image.sortOrder,
      })),
    },
    mealContext,
    voteSummary: buildVoteSummary(voteCounts),
    highlightComments: post.comments.map((comment) => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      author: comment.author,
      likeCount: comment._count.likes,
    })),
    latestAiJudgement: post.aiJudgements[0] ? toFeedAiJudgement(post.aiJudgements[0]) : null,
    similarPrecedents,
    externalRagContexts,
    currentRecommendedMeal,
    ragPolicy: buildRagPolicy(similarPrecedents.length, externalRagContexts.length, options),
  } satisfies SnackJudgementContextWithoutSummary;

  return {
    ...contextWithoutSummary,
    evidenceSummary: buildEvidenceSummary(contextWithoutSummary),
  };
}

export async function buildSnackJudgementContextFromInput(
  input: SnackJudgementInputDraft,
  options: BuildContextOptions = {},
): Promise<SnackJudgementContext> {
  const tags = normalizeTags(input.tags ?? []);
  const precedentTarget: PostForPrecedentSearch = {
    id: `input-${Date.now()}`,
    snackName: input.snackName.trim(),
    reason: input.reason.trim(),
    createdAt: new Date(),
    tags: tags.map((name) => ({
      tag: {
        name,
      },
    })),
  };
  const [similarPrecedents, currentRecommendedMeal] = await Promise.all([
    findSimilarPrecedents(precedentTarget),
    getCurrentRecommendedMealContext(),
  ]);
  const externalRagContexts = await maybeFindExternalRagContexts(
    {
      snackName: precedentTarget.snackName,
      reason: precedentTarget.reason,
      tags,
    },
    similarPrecedents.length,
    options,
  );
  const contextWithoutSummary = {
    contextVersion: SNACK_JUDGEMENT_CONTEXT_VERSION,
    source: "input" as const,
    post: {
      id: null,
      snackName: precedentTarget.snackName,
      reason: precedentTarget.reason,
      ateLunch: false,
      ateDinner: false,
      status: null,
      visibility: null,
      createdAt: null,
      author: null,
      tags,
      imageCount: 0,
      images: [],
    },
    mealContext: null,
    voteSummary: buildVoteSummary(emptyVoteCounts()),
    highlightComments: [],
    latestAiJudgement: null,
    similarPrecedents,
    externalRagContexts,
    currentRecommendedMeal,
    ragPolicy: buildRagPolicy(similarPrecedents.length, externalRagContexts.length, options),
  } satisfies SnackJudgementContextWithoutSummary;

  return {
    ...contextWithoutSummary,
    evidenceSummary: buildEvidenceSummary(contextWithoutSummary),
  };
}

export async function getCurrentRecommendedMealContext() {
  const meal = await findRecommendedMeal();

  return serializeMealMenu(meal);
}

export function serializeJudgementContextForPrompt(context: SnackJudgementContext) {
  return JSON.stringify(
    {
      contextVersion: context.contextVersion,
      currentPost: context.post,
      mealContext: context.mealContext,
      currentRecommendedMeal: context.currentRecommendedMeal,
      voteSummary: context.voteSummary,
      highlightComments: context.highlightComments.map((comment) => ({
        content: comment.content,
        likeCount: comment.likeCount,
      })),
      latestAiJudgement: context.latestAiJudgement
        ? {
            verdict: context.latestAiJudgement.verdict,
            summary: context.latestAiJudgement.summary,
            reasoning: context.latestAiJudgement.reasoning,
            createdAt: context.latestAiJudgement.createdAt,
          }
        : null,
      similarPrecedents: context.similarPrecedents,
      externalRagContexts: context.externalRagContexts,
      ragPolicy: context.ragPolicy,
      evidenceSummary: context.evidenceSummary,
    },
    null,
    2,
  );
}

export function buildSnackJudgeInputFromContext(context: SnackJudgementContext) {
  return {
    contextVersion: context.contextVersion,
    contextSummary: serializeJudgementContextForPrompt(context),
    contextEvidenceSummary: context.evidenceSummary,
    postId: context.post.id,
    postCreatedAt: context.post.createdAt,
    snackName: context.post.snackName,
    reason: context.post.reason,
    ateLunch: context.post.ateLunch,
    ateDinner: context.post.ateDinner,
    authorName:
      context.post.author?.name ||
      context.post.author?.email ||
      (context.source === "input" ? "draft user" : "anonymous user"),
    tags: context.post.tags,
    imageCount: context.post.imageCount,
    imageEvidence: context.post.images.map((image) => ({
      id: image.id,
      storageType: image.storageType,
      sourceUrl: image.sourceUrl,
      altText: image.altText,
      width: image.width,
      height: image.height,
      sortOrder: image.sortOrder,
    })),
    mealContext: context.mealContext
      ? {
          ateLunch: context.mealContext.ateLunch,
          ateDinner: context.mealContext.ateDinner,
          lunchMenu: formatMealForPrompt(context.mealContext.lunchMenu),
          dinnerMenu: formatMealForPrompt(context.mealContext.dinnerMenu),
        }
      : null,
    currentRecommendedMeal: formatMealForPrompt(context.currentRecommendedMeal),
    voteCounts: context.voteSummary.voteCounts,
    voteSummary: context.voteSummary,
    highlightComments: context.highlightComments.map((comment) => ({
      content: comment.content,
      likeCount: comment.likeCount,
    })),
    latestAiJudgement: context.latestAiJudgement
      ? {
          verdict: context.latestAiJudgement.verdict,
          summary: context.latestAiJudgement.summary,
          reasoning: context.latestAiJudgement.reasoning,
          createdAt: context.latestAiJudgement.createdAt,
        }
      : null,
    precedents: context.similarPrecedents,
    externalRagContexts: context.externalRagContexts,
  };
}

function serializeMealMenu(meal: MealMenu | JudgementMealMenu | null): JudgementMealMenu | null {
  if (!meal) {
    return null;
  }

  return {
    id: meal.id,
    mealDate: meal.mealDate instanceof Date ? meal.mealDate.toISOString() : meal.mealDate,
    mealType: meal.mealType,
    menuText: meal.menuText,
    imageUrl: meal.imageUrl,
  };
}

function formatMealForPrompt(meal: JudgementMealMenu | null) {
  if (!meal) {
    return null;
  }

  const menuText = meal.menuText.trim() || meal.imageUrl || "menu text unavailable";

  return `${meal.mealDate.slice(0, 10)} ${meal.mealType}: ${menuText}`;
}

async function maybeFindExternalRagContexts(
  input: {
    snackName: string;
    reason: string;
    tags: string[];
  },
  precedentCount: number,
  options: BuildContextOptions,
) {
  const includeExternalRag = options.includeExternalRag ?? true;
  const shouldUseExternal =
    includeExternalRag && (options.forceExternalRag || shouldUseExternalSnackRag(precedentCount));

  if (!shouldUseExternal) {
    return [];
  }

  return findExternalSnackRagContexts({
    ...input,
    limit: options.externalRagLimit ?? DEFAULT_EXTERNAL_RAG_LIMIT,
  }).catch((error) => {
    console.warn("External snack RAG lookup failed", error);
    return [];
  });
}

function buildVoteSummary(voteCounts: VoteCounts): SnackJudgementContext["voteSummary"] {
  const rankedVotes = voteTypes
    .map((type) => ({
      type,
      count: voteCounts[type] ?? 0,
    }))
    .sort((a, b) => b.count - a.count);
  const leadingVote = rankedVotes.find((vote) => vote.count > 0) ?? null;

  return {
    voteCounts,
    totalVotes: rankedVotes.reduce((total, vote) => total + vote.count, 0),
    leadingVote,
  };
}

function buildRagPolicy(
  precedentCount: number,
  externalRagCount: number,
  options: BuildContextOptions,
): SnackJudgementContext["ragPolicy"] {
  return {
    internalPrecedentsFirst: true,
    minInternalPrecedents: 3,
    externalRagNeeded: shouldUseExternalSnackRag(precedentCount),
    externalRagUsed: externalRagCount > 0,
    forcedExternalRag: Boolean(options.forceExternalRag),
  };
}

function buildEvidenceSummary(
  context: SnackJudgementContextWithoutSummary,
) {
  const summary = [
    `유사 판례 ${context.similarPrecedents.length}건을 참고했습니다.`,
    context.externalRagContexts.length
      ? `내부 판례가 부족해 외부 RAG 문서 ${context.externalRagContexts.length}건을 보조 근거로 참고했습니다.`
      : "외부 RAG 문서는 사용하지 않았습니다.",
    hasMealContext(context)
      ? "식단 맥락을 판결 근거에 포함했습니다."
      : "식단 맥락은 사용할 수 있는 데이터가 없었습니다.",
    context.voteSummary.totalVotes
      ? `현재 포스트 투표 ${context.voteSummary.totalVotes}건을 사회적 신호로 참고했습니다.`
      : "현재 포스트 투표는 아직 없어 참고하지 못했습니다.",
  ];

  if (context.highlightComments.length) {
    summary.push(`좋아요 상위 댓글 ${context.highlightComments.length}건을 참고했습니다.`);
  }

  return summary;
}

function hasMealContext(context: SnackJudgementContextWithoutSummary) {
  return Boolean(
    context.mealContext?.lunchMenu ||
      context.mealContext?.dinnerMenu ||
      context.currentRecommendedMeal,
  );
}

function countVotes(votes: SnackVoteType[]) {
  return voteTypes.reduce((counts, type) => {
    counts[type] = votes.filter((vote) => vote === type).length;
    return counts;
  }, emptyVoteCounts());
}

function normalizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
}
