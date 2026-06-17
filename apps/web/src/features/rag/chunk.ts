export type ReviewChunkInputSource = {
  reviewId: string;
  title: string;
  content: string;
  menuNames: string[];
  tags: string[];
};

export type CommentChunkInputSource = {
  commentId: string;
  reviewId: string;
  reviewTitle: string;
  content: string;
};

export type RagSearchInput = {
  query?: unknown;
  limit?: unknown;
};

export type NormalizedRagSearchQuery = {
  query: string;
  limit: number;
};

const DEFAULT_RAG_SEARCH_LIMIT = 5;
const MAX_RAG_SEARCH_LIMIT = 10;
const FALLBACK_DISH_TERMS = [
  "돼지불고기",
  "소불고기",
  "함박스테이크",
  "스테이크",
  "마파두부",
  "불고기",
  "돈까스",
  "파스타",
  "볶음밥",
  "비빔밥",
  "덮밥",
  "탕수육",
  "유린기",
  "닭갈비",
  "제육",
  "커리",
  "카레",
  "국밥",
  "미역국",
  "뚝배기"
];
const FALLBACK_STOP_TERMS = new Set(["쌀밥", "잡곡밥", "흰밥", "밥", "김치", "깍두기", "국", "장국"]);

export function buildReviewChunkInput(source: ReviewChunkInputSource) {
  const lines = [
    `제목: ${source.title}`,
    source.menuNames.length ? `메뉴: ${source.menuNames.join(", ")}` : "",
    source.tags.length ? `태그: ${source.tags.join(", ")}` : "",
    `내용: ${source.content}`
  ].filter(Boolean);

  return {
    reviewId: source.reviewId,
    content: lines.join("\n"),
    metadata: {
      kind: "review",
      reviewId: source.reviewId,
      menuNames: source.menuNames,
      tags: source.tags
    }
  };
}

export function buildCommentChunkInput(source: CommentChunkInputSource) {
  return {
    commentId: source.commentId,
    content: `후기 제목: ${source.reviewTitle}\n댓글: ${source.content}`,
    metadata: {
      kind: "comment",
      commentId: source.commentId,
      reviewId: source.reviewId
    }
  };
}

export function normalizeRagSearchQuery(input: RagSearchInput): NormalizedRagSearchQuery {
  const query = typeof input.query === "string" ? input.query.trim() : "";

  if (!query) {
    throw new Error("rag query is required");
  }

  const parsedLimit = Number(input.limit);
  const limit =
    Number.isInteger(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_RAG_SEARCH_LIMIT)
      : DEFAULT_RAG_SEARCH_LIMIT;

  return {
    query,
    limit
  };
}

export function buildRagFallbackQueries(query: string): string[] {
  const normalized = query.trim();
  const terms: string[] = [];

  for (const term of FALLBACK_DISH_TERMS) {
    if (normalized.includes(term)) {
      terms.push(term);
    }
  }

  for (const token of normalized.split(/[,&+*·ㆍ/()\[\]\s]+/)) {
    const cleaned = token.trim();

    if (cleaned.length >= 3 && cleaned !== normalized && !FALLBACK_STOP_TERMS.has(cleaned)) {
      terms.push(cleaned);
    }
  }

  return Array.from(new Set(terms));
}
