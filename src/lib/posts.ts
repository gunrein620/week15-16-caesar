import type { AiJudgement, Prisma } from "@/generated/prisma/client";
import { toFeedMealMenu } from "@/lib/meals";
import { prisma } from "@/lib/prisma";
import type { FeedMealContext } from "@/types/meal";
import type {
  FeedAiJudgement,
  FeedComment,
  FeedPost,
  SnackAiVerdict,
  SnackVoteType,
  VoteCounts,
} from "@/types/post";
import { voteTypes } from "@/types/post";

const authorSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
} satisfies Prisma.UserSelect;

export const postInclude = {
  author: {
    select: authorSelect,
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
  aiJudgements: {
    orderBy: {
      createdAt: "desc",
    },
    take: 1,
  },
} satisfies Prisma.PostInclude;

type PostWithRelations = Prisma.PostGetPayload<{
  include: typeof postInclude;
}>;

export function commentInclude(viewerId?: string) {
  return {
    author: {
      select: authorSelect,
    },
    _count: {
      select: {
        likes: true,
      },
    },
    likes: {
      where: {
        userId: viewerId ?? "",
      },
      select: {
        userId: true,
      },
      take: 1,
    },
  } satisfies Prisma.CommentInclude;
}

type CommentWithRelations = Prisma.CommentGetPayload<{
  include: ReturnType<typeof commentInclude>;
}>;

export function emptyVoteCounts(): VoteCounts {
  return voteTypes.reduce((counts, type) => {
    counts[type] = 0;
    return counts;
  }, {} as VoteCounts);
}

export function isSnackVoteType(value: unknown): value is SnackVoteType {
  return typeof value === "string" && voteTypes.includes(value as SnackVoteType);
}

export function toFeedComment(comment: CommentWithRelations): FeedComment {
  return {
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    author: comment.author,
    likeCount: comment._count.likes,
    myLiked: comment.likes.length > 0,
  };
}

export function toFeedAiJudgement(judgement: AiJudgement): FeedAiJudgement {
  const rawJson = asJsonObject(judgement.rawJson);

  return {
    id: judgement.id,
    verdict: judgement.verdict as SnackAiVerdict,
    title: readJsonString(rawJson, "title"),
    summary: judgement.summary,
    reasoning: judgement.reasoning,
    recommendation: readJsonString(rawJson, "recommendation"),
    confidence: readJsonNumber(rawJson, "confidence"),
    evidence: toFeedAiEvidence(rawJson),
    modelName: judgement.modelName,
    promptVersion: judgement.promptVersion,
    createdAt: judgement.createdAt.toISOString(),
  };
}

export async function getVoteSummary(postId: string, viewerId?: string) {
  const [groups, myVote] = await Promise.all([
    prisma.vote.groupBy({
      by: ["type"],
      where: {
        postId,
      },
      _count: {
        _all: true,
      },
    }),
    viewerId
      ? prisma.vote.findUnique({
          where: {
            postId_userId: {
              postId,
              userId: viewerId,
            },
          },
          select: {
            type: true,
          },
        })
      : null,
  ]);

  const voteCounts = emptyVoteCounts();
  for (const group of groups) {
    voteCounts[group.type as SnackVoteType] = group._count._all;
  }

  return {
    voteCounts,
    myVote: (myVote?.type as SnackVoteType | undefined) ?? null,
  };
}

export async function getPostHighlightComments(postId: string, viewerId?: string) {
  const comments = await prisma.comment.findMany({
    where: {
      postId,
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
    include: commentInclude(viewerId),
  });

  return comments.map(toFeedComment);
}

export async function getPostComments(postId: string, viewerId?: string) {
  const comments = await prisma.comment.findMany({
    where: {
      postId,
      status: "PUBLISHED",
    },
    orderBy: {
      createdAt: "desc",
    },
    include: commentInclude(viewerId),
  });

  return comments.map(toFeedComment);
}

export async function getCommentLikeSummary(commentId: string, viewerId?: string) {
  const [likeCount, myLike] = await Promise.all([
    prisma.commentLike.count({
      where: {
        commentId,
      },
    }),
    viewerId
      ? prisma.commentLike.findUnique({
          where: {
            commentId_userId: {
              commentId,
              userId: viewerId,
            },
          },
          select: {
            userId: true,
          },
        })
      : null,
  ]);

  return {
    commentId,
    likeCount,
    myLiked: Boolean(myLike),
  };
}

export async function toFeedPosts(posts: PostWithRelations[], viewerId?: string) {
  const postIds = posts.map((post) => post.id);

  if (postIds.length === 0) {
    return [];
  }

  const [voteGroups, myVotes, commentCountGroups, highlightComments] = await Promise.all([
    prisma.vote.groupBy({
      by: ["postId", "type"],
      where: {
        postId: {
          in: postIds,
        },
      },
      _count: {
        _all: true,
      },
    }),
    viewerId
      ? prisma.vote.findMany({
          where: {
            postId: {
              in: postIds,
            },
            userId: viewerId,
          },
          select: {
            postId: true,
            type: true,
          },
        })
      : [],
    prisma.comment.groupBy({
      by: ["postId"],
      where: {
        postId: {
          in: postIds,
        },
        status: "PUBLISHED",
      },
      _count: {
        _all: true,
      },
    }),
    Promise.all(postIds.map((postId) => getPostHighlightComments(postId, viewerId))),
  ]);

  const voteCountsByPost = new Map<string, VoteCounts>();
  for (const postId of postIds) {
    voteCountsByPost.set(postId, emptyVoteCounts());
  }

  for (const group of voteGroups) {
    const counts = voteCountsByPost.get(group.postId);
    if (counts) {
      counts[group.type as SnackVoteType] = group._count._all;
    }
  }

  const myVoteByPost = new Map(
    myVotes.map((vote) => [vote.postId, vote.type as SnackVoteType]),
  );
  const commentCountByPost = new Map(
    commentCountGroups.map((group) => [group.postId, group._count._all]),
  );
  const highlightCommentsByPost = new Map(
    postIds.map((postId, index) => [postId, highlightComments[index] ?? []]),
  );

  return posts.map<FeedPost>((post) => ({
    id: post.id,
    snackName: post.snackName,
    reason: post.reason,
    ateLunch: post.ateLunch,
    ateDinner: post.ateDinner,
    createdAt: post.createdAt.toISOString(),
    author: post.author,
    images: post.images.map((image) => ({
      id: image.id,
      url: image.url,
      filename: image.filename,
      sortOrder: image.sortOrder,
      sourceUrl: image.sourceUrl,
      altText: image.altText,
      width: image.width,
      height: image.height,
    })),
    tags: post.tags.map((postTag) => postTag.tag.name),
    voteCounts: voteCountsByPost.get(post.id) ?? emptyVoteCounts(),
    myVote: myVoteByPost.get(post.id) ?? null,
    commentCount: commentCountByPost.get(post.id) ?? 0,
    highlightComments: highlightCommentsByPost.get(post.id) ?? [],
    mealContext: toFeedMealContext(post.mealContext),
    aiJudgement: post.aiJudgements[0] ? toFeedAiJudgement(post.aiJudgements[0]) : null,
  }));
}

function asJsonObject(value: Prisma.JsonValue) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, Prisma.JsonValue>;
  }

  return {};
}

function readJsonString(value: Record<string, Prisma.JsonValue>, key: string) {
  const item = value[key];
  return typeof item === "string" && item.trim() ? item.trim() : null;
}

function readJsonNumber(value: Record<string, Prisma.JsonValue>, key: string) {
  const item = value[key];
  return typeof item === "number" && Number.isFinite(item) ? item : null;
}

function toFeedAiEvidence(rawJson: Record<string, Prisma.JsonValue>): FeedAiJudgement["evidence"] {
  const contextVersion = readJsonString(rawJson, "contextVersion");
  const usedPrecedents = readJsonArray(rawJson, "usedPrecedents");
  const usedExternalRag = readJsonArray(rawJson, "usedExternalRag");
  const evidenceSummary = readJsonStringArray(rawJson, "evidenceSummary");
  const usedMealContext = rawJson.usedMealContext;
  const usedVoteSummary = rawJson.usedVoteSummary;

  if (
    !contextVersion &&
    usedPrecedents.length === 0 &&
    usedExternalRag.length === 0 &&
    evidenceSummary.length === 0 &&
    !hasJsonEvidence(usedMealContext) &&
    !hasJsonEvidence(usedVoteSummary)
  ) {
    return null;
  }

  return {
    usedPrecedentCount: usedPrecedents.length,
    usedExternalRag: usedExternalRag.length > 0,
    usedMealContext: hasJsonEvidence(usedMealContext),
    usedVoteSummary: hasJsonEvidence(usedVoteSummary),
    contextVersion,
    summary: evidenceSummary,
  };
}

function readJsonArray(value: Record<string, Prisma.JsonValue>, key: string) {
  const item = value[key];
  return Array.isArray(item) ? item : [];
}

function readJsonStringArray(value: Record<string, Prisma.JsonValue>, key: string) {
  return readJsonArray(value, key).filter((item): item is string => typeof item === "string");
}

function hasJsonEvidence(value: Prisma.JsonValue | undefined): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "object") {
    return Object.values(value).some((item) => hasJsonEvidence(item));
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  return Boolean(value);
}

function toFeedMealContext(
  mealContext: PostWithRelations["mealContext"],
): FeedMealContext | null {
  if (!mealContext) {
    return null;
  }

  return {
    ateLunch: mealContext.ateLunch,
    ateDinner: mealContext.ateDinner,
    mealNote: mealContext.mealNote,
    lunchMenu: mealContext.lunchMenu ? toFeedMealMenu(mealContext.lunchMenu) : null,
    dinnerMenu: mealContext.dinnerMenu ? toFeedMealMenu(mealContext.dinnerMenu) : null,
  };
}
