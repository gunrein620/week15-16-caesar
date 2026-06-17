import assert from "node:assert/strict";
import test from "node:test";
import { assertCommentAuthor, normalizeCommentInput } from "./comment.ts";

test("normalizeCommentInput trims content", () => {
  assert.deepEqual(normalizeCommentInput({ content: "  good point  " }), {
    content: "good point"
  });
});

test("normalizeCommentInput rejects empty content", () => {
  assert.throws(() => normalizeCommentInput({ content: "   " }), /comment content is required/);
});

test("assertCommentAuthor rejects missing or foreign comments", () => {
  assert.throws(() => assertCommentAuthor(null, "user-1"), /comment not found/);
  assert.throws(() => assertCommentAuthor({ authorId: "user-2" }, "user-1"), /forbidden/);
  assert.doesNotThrow(() => assertCommentAuthor({ authorId: "user-1" }, "user-1"));
});
