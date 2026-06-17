import type { FeedMealContext } from "@/types/meal";

export const voteTypes = [
  "INNOCENT",
  "PROBATION",
  "GUILTY_BUT_UNDERSTANDABLE",
  "NOT_GUILTY_BY_CONTEXT",
  "NEEDS_MORE_EXCUSE",
] as const;

export type SnackVoteType = (typeof voteTypes)[number];

export type VoteCounts = Record<SnackVoteType, number>;

export type SnackAiVerdict =
  | "INNOCENT"
  | "PROBATION"
  | "GUILTY_BUT_UNDERSTANDABLE"
  | "NEEDS_MORE_CONTEXT";

export type FeedAuthor = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export type FeedImage = {
  id: string;
  url: string;
  filename: string;
  sortOrder: number;
  sourceUrl: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
};

export type FeedComment = {
  id: string;
  content: string;
  createdAt: string;
  author: FeedAuthor;
  likeCount: number;
  myLiked: boolean;
};

export type FeedAiJudgement = {
  id: string;
  verdict: SnackAiVerdict;
  title: string | null;
  summary: string;
  reasoning: string;
  recommendation: string | null;
  confidence: number | null;
  evidence: {
    usedPrecedentCount: number;
    usedExternalRag: boolean;
    usedMealContext: boolean;
    usedVoteSummary: boolean;
    contextVersion: string | null;
    summary: string[];
  } | null;
  modelName: string;
  promptVersion: string;
  createdAt: string;
};

export type FeedPost = {
  id: string;
  snackName: string;
  reason: string;
  ateLunch: boolean;
  ateDinner: boolean;
  createdAt: string;
  author: FeedAuthor;
  images: FeedImage[];
  tags: string[];
  voteCounts: VoteCounts;
  myVote: SnackVoteType | null;
  commentCount: number;
  highlightComments: FeedComment[];
  mealContext: FeedMealContext | null;
  aiJudgement: FeedAiJudgement | null;
};

export type InitialSession = {
  user: FeedAuthor;
} | null;
