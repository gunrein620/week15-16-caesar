export type SemanticRagRow = {
  id: string;
  content: string;
  metadata: unknown;
  createdAt: Date;
  distance: number;
  reviewId: string | null;
  reviewTitle: string | null;
  reviewRating: number | null;
  reviewMenuNames: string[] | null;
  reviewAuthorName: string | null;
  commentId: string | null;
  commentReviewId: string | null;
  commentAuthorName: string | null;
  commentReviewTitle: string | null;
};

export type RagSearchResult = {
  id: string;
  content: string;
  metadata: unknown;
  createdAt: Date;
  similarity?: number;
  review: {
    id: string;
    title: string;
    rating: number | null;
    menuNames: string[];
    author: {
      name: string;
    };
  } | null;
  comment: {
    id: string;
    reviewId: string;
    author: {
      name: string;
    };
    review: {
      id: string;
      title: string;
    };
  } | null;
};

export function mapSemanticRagRows(rows: SemanticRagRow[]): RagSearchResult[] {
  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    metadata: row.metadata,
    createdAt: row.createdAt,
    similarity: Math.max(0, 1 - row.distance),
    review: row.reviewId
      ? {
          id: row.reviewId,
          title: row.reviewTitle ?? "",
          rating: row.reviewRating,
          menuNames: row.reviewMenuNames ?? [],
          author: {
            name: row.reviewAuthorName ?? ""
          }
        }
      : null,
    comment:
      row.commentId && row.commentReviewId
        ? {
            id: row.commentId,
            reviewId: row.commentReviewId,
            author: {
              name: row.commentAuthorName ?? ""
            },
            review: {
              id: row.commentReviewId,
              title: row.commentReviewTitle ?? ""
            }
          }
        : null
  }));
}
