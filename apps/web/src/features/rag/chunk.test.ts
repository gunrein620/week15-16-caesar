import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommentChunkInput,
  buildRagFallbackQueries,
  buildReviewChunkInput,
  normalizeRagSearchQuery
} from "./chunk.ts";

test("buildReviewChunkInput creates searchable review text and metadata", () => {
  const chunk = buildReviewChunkInput({
    reviewId: "review-1",
    title: "Jeyuk review",
    content: "Spicy and good.",
    menuNames: ["Jeyuk", "Rice"],
    tags: ["spicy", "lunch"]
  });

  assert.deepEqual(chunk, {
    reviewId: "review-1",
    content: "제목: Jeyuk review\n메뉴: Jeyuk, Rice\n태그: spicy, lunch\n내용: Spicy and good.",
    metadata: {
      kind: "review",
      reviewId: "review-1",
      menuNames: ["Jeyuk", "Rice"],
      tags: ["spicy", "lunch"]
    }
  });
});

test("buildCommentChunkInput creates searchable comment text and metadata", () => {
  const chunk = buildCommentChunkInput({
    commentId: "comment-1",
    reviewId: "review-1",
    reviewTitle: "Jeyuk review",
    content: "I agree."
  });

  assert.deepEqual(chunk, {
    commentId: "comment-1",
    content: "후기 제목: Jeyuk review\n댓글: I agree.",
    metadata: {
      kind: "comment",
      commentId: "comment-1",
      reviewId: "review-1"
    }
  });
});

test("normalizeRagSearchQuery trims query and clamps limit", () => {
  assert.deepEqual(normalizeRagSearchQuery({ query: "  jeyuk  ", limit: "20" }), {
    query: "jeyuk",
    limit: 10
  });
  assert.deepEqual(normalizeRagSearchQuery({ query: "rice", limit: "0" }), {
    query: "rice",
    limit: 5
  });
});

test("normalizeRagSearchQuery rejects empty query", () => {
  assert.throws(() => normalizeRagSearchQuery({ query: "   ", limit: "5" }), /rag query is required/);
});

test("buildRagFallbackQueries extracts useful dish terms from compact menu names", () => {
  assert.deepEqual(buildRagFallbackQueries("뚝배기돼지불고기"), ["돼지불고기", "불고기", "뚝배기"]);
  assert.deepEqual(buildRagFallbackQueries("에그함박스테이크&쌀밥"), [
    "함박스테이크",
    "스테이크",
    "에그함박스테이크"
  ]);
});
