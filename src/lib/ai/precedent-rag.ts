import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { voteTypes, type SnackVoteType } from "@/types/post";

const MAX_CANDIDATES = 40;
const MAX_PRECEDENTS = 5;
const MIN_TOKEN_LENGTH = 2;

const voteToAiVerdict: Record<SnackVoteType, string> = {
  INNOCENT: "INNOCENT",
  PROBATION: "PROBATION",
  GUILTY_BUT_UNDERSTANDABLE: "GUILTY_BUT_UNDERSTANDABLE",
  NOT_GUILTY_BY_CONTEXT: "INNOCENT",
  NEEDS_MORE_EXCUSE: "NEEDS_MORE_CONTEXT",
};

export type PrecedentRagCase = {
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
  conclusion:
    | {
        source: "COMMUNITY_VOTE";
        verdict: string;
        confidence: number;
        note: string;
      }
    | {
        source: "AI_JUDGEMENT";
        verdict: string;
        confidence: number | null;
        note: string;
      }
    | {
        source: "UNRESOLVED_AI_SHOULD_INFER";
        verdict: null;
        confidence: null;
        note: string;
      };
};

type TargetPost = {
  id: string;
  snackName: string;
  reason: string;
  createdAt: Date;
  tags: Array<{
    tag: {
      name: string;
    };
  }>;
};

type CandidatePost = Prisma.PostGetPayload<{
  include: {
    tags: {
      include: {
        tag: true;
      };
    };
    votes: {
      select: {
        type: true;
      };
    };
    aiJudgements: {
      orderBy: {
        createdAt: "desc";
      };
      take: 1;
    };
  };
}>;

export async function findSimilarPrecedents(targetPost: TargetPost): Promise<PrecedentRagCase[]> {
  const targetTags = targetPost.tags.map((postTag) => postTag.tag.name);
  const targetTokens = tokenize([targetPost.snackName, targetPost.reason, ...targetTags].join(" "));

  if (targetTokens.length === 0 && targetTags.length === 0) {
    return [];
  }

  const candidates = await prisma.post.findMany({
    where: {
      id: {
        not: targetPost.id,
      },
      status: "PUBLISHED",
      visibility: "PUBLIC",
      createdAt: {
        lt: targetPost.createdAt,
      },
      OR: [
        ...targetTags.map((tagName) => ({
          tags: {
            some: {
              tag: {
                name: tagName,
              },
            },
          },
        })),
        ...Array.from(targetTokens.slice(0, 8)).flatMap((token) => [
          {
            snackName: {
              contains: token,
              mode: "insensitive" as const,
            },
          },
          {
            reason: {
              contains: token,
              mode: "insensitive" as const,
            },
          },
        ]),
      ],
    },
    orderBy: {
      createdAt: "desc",
    },
    take: MAX_CANDIDATES,
    include: {
      tags: {
        include: {
          tag: true,
        },
      },
      votes: {
        select: {
          type: true,
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

  return candidates
    .map((candidate) =>
      toPrecedentCase(candidate, targetPost.snackName, targetTokens, targetTags),
    )
    .filter((precedent) => precedent.similarityScore > 0)
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, MAX_PRECEDENTS);
}

function toPrecedentCase(
  post: CandidatePost,
  targetSnackName: string,
  targetTokens: string[],
  targetTags: string[],
): PrecedentRagCase {
  const tags = post.tags.map((postTag) => postTag.tag.name);
  const candidateTokens = tokenize([post.snackName, post.reason, ...tags].join(" "));
  const sharedTokens = intersection(targetTokens, candidateTokens);
  const sharedTags = intersection(
    targetTags.map((tag) => tag.toLowerCase()),
    tags.map((tag) => tag.toLowerCase()),
  );
  const exactSnackMatch = post.snackName.trim().toLowerCase() === targetSnackName.trim().toLowerCase();
  const snackTokenHits = intersection(tokenize(post.snackName), targetTokens);
  const voteCounts = countVotes(post.votes.map((vote) => vote.type as SnackVoteType));

  const similaritySignals = [
    sharedTags.length ? `공통 태그 ${sharedTags.join(", ")}` : null,
    snackTokenHits.length ? `간식명 토큰 ${snackTokenHits.join(", ")}` : null,
    sharedTokens.length ? `공통 표현 ${sharedTokens.slice(0, 5).join(", ")}` : null,
  ].filter(Boolean) as string[];

  const similarityScore =
    sharedTags.length * 5 +
    snackTokenHits.length * 4 +
    sharedTokens.length +
    (exactSnackMatch ? 8 : 0);

  return {
    postId: post.id,
    snackName: post.snackName,
    reason: post.reason,
    tags,
    ateLunch: post.ateLunch,
    ateDinner: post.ateDinner,
    createdAt: post.createdAt.toISOString(),
    similarityScore,
    similaritySignals,
    voteCounts,
    conclusion: resolveConclusion(voteCounts, post.aiJudgements[0] ?? null),
  };
}

function resolveConclusion(
  voteCounts: Record<string, number>,
  aiJudgement: CandidatePost["aiJudgements"][number] | null,
): PrecedentRagCase["conclusion"] {
  const rankedVotes = voteTypes
    .map((type) => ({
      type,
      count: voteCounts[type] ?? 0,
    }))
    .sort((a, b) => b.count - a.count);
  const topVote = rankedVotes[0];
  const runnerUp = rankedVotes[1];
  const totalVotes = rankedVotes.reduce((total, vote) => total + vote.count, 0);

  if (topVote && topVote.count >= 2 && topVote.count > (runnerUp?.count ?? 0)) {
    return {
      source: "COMMUNITY_VOTE",
      verdict: voteToAiVerdict[topVote.type],
      confidence: Math.min(0.95, topVote.count / Math.max(totalVotes, 1)),
      note: `유저 투표 ${totalVotes}표 중 ${topVote.count}표가 ${topVote.type}에 모였습니다.`,
    };
  }

  if (aiJudgement) {
    const rawJson = asJsonObject(aiJudgement.rawJson);
    const confidence = typeof rawJson.confidence === "number" ? rawJson.confidence : null;

    return {
      source: "AI_JUDGEMENT",
      verdict: aiJudgement.verdict,
      confidence,
      note: `기존 AI 판결 요약: ${aiJudgement.summary}`,
    };
  }

  return {
    source: "UNRESOLVED_AI_SHOULD_INFER",
    verdict: null,
    confidence: null,
    note: "투표 결론과 기존 AI 판결이 없어 이번 판결에서 유사 판례 결론을 먼저 추론해야 합니다.",
  };
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

function countVotes(votes: SnackVoteType[]) {
  return voteTypes.reduce(
    (counts, type) => {
      counts[type] = votes.filter((vote) => vote === type).length;
      return counts;
    },
    {} as Record<string, number>,
  );
}

function asJsonObject(value: Prisma.JsonValue) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, Prisma.JsonValue>;
  }

  return {};
}
