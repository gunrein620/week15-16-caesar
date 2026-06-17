import assert from "node:assert/strict";
import test from "node:test";
import { mapSemanticRagRows } from "./semantic-search.ts";

test("mapSemanticRagRows maps review rows to the public RAG result shape", () => {
  const createdAt = new Date("2026-06-08T03:00:00.000Z");
  const results = mapSemanticRagRows([
    {
      id: "chunk-1",
      content: "제목: 제육볶음 후기",
      metadata: { kind: "review" },
      createdAt,
      distance: 0.25,
      reviewId: "review-1",
      reviewTitle: "제육볶음 후기",
      reviewRating: 4,
      reviewMenuNames: ["제육볶음", "잡곡밥"],
      reviewAuthorName: "정글러",
      commentId: null,
      commentReviewId: null,
      commentAuthorName: null,
      commentReviewTitle: null
    }
  ]);

  assert.deepEqual(results, [
    {
      id: "chunk-1",
      content: "제목: 제육볶음 후기",
      metadata: { kind: "review" },
      createdAt,
      similarity: 0.75,
      review: {
        id: "review-1",
        title: "제육볶음 후기",
        rating: 4,
        menuNames: ["제육볶음", "잡곡밥"],
        author: {
          name: "정글러"
        }
      },
      comment: null
    }
  ]);
});

test("mapSemanticRagRows maps comment rows to the public RAG result shape", () => {
  const createdAt = new Date("2026-06-08T03:00:00.000Z");
  const results = mapSemanticRagRows([
    {
      id: "chunk-2",
      content: "댓글: 다음에 또 먹고 싶어요.",
      metadata: { kind: "comment" },
      createdAt,
      distance: 0.5,
      reviewId: null,
      reviewTitle: null,
      reviewRating: null,
      reviewMenuNames: null,
      reviewAuthorName: null,
      commentId: "comment-1",
      commentReviewId: "review-1",
      commentAuthorName: "동료",
      commentReviewTitle: "닭갈비 후기"
    }
  ]);

  assert.deepEqual(results, [
    {
      id: "chunk-2",
      content: "댓글: 다음에 또 먹고 싶어요.",
      metadata: { kind: "comment" },
      createdAt,
      similarity: 0.5,
      review: null,
      comment: {
        id: "comment-1",
        reviewId: "review-1",
        author: {
          name: "동료"
        },
        review: {
          id: "review-1",
          title: "닭갈비 후기"
        }
      }
    }
  ]);
});
