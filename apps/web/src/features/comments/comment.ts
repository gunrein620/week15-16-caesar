export type CommentInput = {
  content?: unknown;
};

export type NormalizedCommentInput = {
  content: string;
};

export function normalizeCommentInput(input: CommentInput): NormalizedCommentInput {
  const content = typeof input.content === "string" ? input.content.trim() : "";

  if (!content) {
    throw new Error("comment content is required");
  }

  return { content };
}

export function assertCommentAuthor(
  comment: { authorId: string } | null,
  userId: string
): asserts comment is { authorId: string } {
  if (!comment) {
    throw new Error("comment not found");
  }

  if (comment.authorId !== userId) {
    throw new Error("forbidden");
  }
}
