import assert from "node:assert/strict";
import test from "node:test";
import {
  assertReviewAuthor,
  buildPagination,
  buildReviewListSearchParams,
  clampReviewPage,
  normalizeReviewInput,
  parseReviewListQuery
} from "./review.ts";

test("normalizeReviewInput trims fields and normalizes lists", () => {
  const result = normalizeReviewInput({
    title: "  Jeyuk was good  ",
    content: "  spicy but nice  ",
    rating: "5",
    menuArchiveId: "",
    imageUrl: " ",
    menuNames: "jeyuk, rice\njeyuk",
    tags: "#spicy, lunch, spicy"
  });

  assert.deepEqual(result, {
    title: "Jeyuk was good",
    content: "spicy but nice",
    rating: 5,
    menuArchiveId: null,
    imageUrl: null,
    menuNames: ["jeyuk", "rice"],
    tags: ["spicy", "lunch"]
  });
});

test("normalizeReviewInput rejects invalid rating", () => {
  assert.throws(
    () =>
      normalizeReviewInput({
        title: "title",
        content: "content",
        rating: 6,
        menuArchiveId: null,
        imageUrl: null,
        menuNames: [],
        tags: []
      }),
    /rating must be between 1 and 5/
  );
});

test("parseReviewListQuery clamps pagination and normalizes search", () => {
  const query = parseReviewListQuery(
    new URLSearchParams({
      page: "-1",
      pageSize: "100",
      query: "  jeyuk  ",
      tag: " spicy ",
      menu: " rice "
    })
  );

  assert.deepEqual(query, {
    page: 1,
    pageSize: 30,
    query: "jeyuk",
    tag: "spicy",
    menu: "rice"
  });
});

test("buildPagination returns total pages with a lower bound of one", () => {
  assert.deepEqual(buildPagination({ total: 0, page: 1, pageSize: 10 }), {
    total: 0,
    page: 1,
    pageSize: 10,
    totalPages: 1
  });
  assert.deepEqual(buildPagination({ total: 21, page: 2, pageSize: 10 }), {
    total: 21,
    page: 2,
    pageSize: 10,
    totalPages: 3
  });
});

test("buildReviewListSearchParams omits empty filters and default page", () => {
  const params = buildReviewListSearchParams({
    page: 1,
    pageSize: 10,
    query: "",
    tag: " spicy ",
    menu: " rice "
  });

  assert.equal(params.toString(), "pageSize=10&tag=spicy&menu=rice");
});

test("clampReviewPage keeps page inside pagination bounds", () => {
  assert.equal(clampReviewPage(0, 5), 1);
  assert.equal(clampReviewPage(3, 5), 3);
  assert.equal(clampReviewPage(9, 5), 5);
  assert.equal(clampReviewPage(9, 0), 1);
});

test("assertReviewAuthor rejects missing or foreign reviews", () => {
  assert.throws(() => assertReviewAuthor(null, "user-1"), /review not found/);
  assert.throws(() => assertReviewAuthor({ authorId: "user-2" }, "user-1"), /forbidden/);
  assert.doesNotThrow(() => assertReviewAuthor({ authorId: "user-1" }, "user-1"));
});
