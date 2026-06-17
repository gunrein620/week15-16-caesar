import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDemoReviewPlans,
  seedDemoReviews,
  selectDemoMenus,
  type DemoMenuArchive,
  type DemoReviewSeedStore
} from "./demo-review-seed.ts";

const sampleMenus: DemoMenuArchive[] = [
  {
    id: "menu-20260421-lunch",
    date: "2026-04-21",
    mealType: "LUNCH",
    items: ["탄탄멘", "추가밥(쌀밥)", "후르츠탕수육"],
    imageUrl: "/images/tantanmen.jpg"
  },
  {
    id: "menu-20260421-dinner",
    date: "2026-04-21",
    mealType: "DINNER",
    items: ["누룽지찜닭", "잡곡밥", "얼큰콩나물국"],
    imageUrl: "/images/chicken.jpg"
  },
  {
    id: "menu-20260607-lunch",
    date: "2026-06-07",
    mealType: "LUNCH",
    items: ["제육볶음", "쌀밥", "미역국"],
    imageUrl: null
  },
  {
    id: "menu-20260608-lunch",
    date: "2026-06-08",
    mealType: "LUNCH",
    items: ["아롱사태수육전골", "잡곡밥", "미역줄기볶음"],
    imageUrl: null
  },
  {
    id: "menu-20260608-dinner",
    date: "2026-06-08",
    mealType: "DINNER",
    items: ["장조림버터돌솥밥", "유부장국", "오징어문어핫바"],
    imageUrl: null
  }
];

test("selectDemoMenus keeps earliest imported menus and newest menus", () => {
  const selected = selectDemoMenus(sampleMenus, 4);

  assert.deepEqual(
    selected.map((menu) => menu.id),
    ["menu-20260608-dinner", "menu-20260608-lunch", "menu-20260421-lunch", "menu-20260421-dinner"]
  );
});

test("buildDemoReviewPlans writes reviews and comments from actual menu items", () => {
  const plans = buildDemoReviewPlans(sampleMenus, { limit: 3 });
  const firstPlan = plans[0];

  assert.equal(plans.length, 3);
  assert.equal(firstPlan.menuArchiveId, "menu-20260608-dinner");
  assert.match(firstPlan.title, /장조림버터돌솥밥/);
  assert.match(firstPlan.content, /유부장국/);
  assert.deepEqual(firstPlan.menuNames, ["장조림버터돌솥밥", "유부장국", "오징어문어핫바"]);
  assert.ok(firstPlan.tags.includes("저녁"));
  assert.ok(firstPlan.comments.length >= 1);
  assert.match(firstPlan.comments[0], /장조림버터돌솥밥/);
});

test("buildDemoReviewPlans creates one hundred reviews by default", () => {
  const menus = Array.from({ length: 110 }, (_, index): DemoMenuArchive => {
    const day = String((index % 28) + 1).padStart(2, "0");

    return {
      id: `menu-${index}`,
      date: `2026-05-${day}`,
      mealType: index % 2 === 0 ? "LUNCH" : "DINNER",
      items: [`메인메뉴${index}`, "잡곡밥", "배추김치"],
      imageUrl: null
    };
  });

  assert.equal(buildDemoReviewPlans(menus).length, 100);
});

test("buildDemoReviewPlans repeats suitable menus when the requested amount is larger than the source", () => {
  const plans = buildDemoReviewPlans(sampleMenus, { limit: 8 });

  assert.equal(plans.length, 8);
  assert.equal(new Set(plans.map((plan) => plan.seedKey)).size, 8);
  assert.ok(plans.filter((plan) => plan.menuArchiveId === "menu-20260608-dinner").length > 1);
});

test("buildDemoReviewPlans avoids duplicate titles when menus are reused", () => {
  const plans = buildDemoReviewPlans([sampleMenus[0]], { limit: 8 });

  assert.equal(new Set(plans.map((plan) => plan.title)).size, plans.length);
});

test("buildDemoReviewPlans keeps visible board text free of seed/demo wording", () => {
  const [plan] = buildDemoReviewPlans(sampleMenus, { limit: 1 });
  const visibleText = [plan.title, plan.content, ...plan.tags, ...plan.comments].join("\n");

  for (const forbidden of ["데모", "시연", "제출", "Slack", "import"]) {
    assert.equal(visibleText.includes(forbidden), false, `${forbidden} should not appear in board text`);
  }

  assert.equal(plan.title.includes("["), false);
  assert.equal(plan.tags.some((tag) => /^\d{4}-\d{2}-\d{2}$/.test(tag)), false);
});

test("buildDemoReviewPlans skips menus with broken item text", () => {
  const plans = buildDemoReviewPlans(
    [
      {
        id: "broken-menu",
        date: "2026-06-09",
        mealType: "LUNCH",
        items: ["소프트타코2종(풀드포크", "치폴레치킨)", "샐러드파스타"],
        imageUrl: null
      },
      sampleMenus[0]
    ],
    { limit: 2 }
  );

  assert.equal(plans.some((plan) => plan.menuArchiveId === "broken-menu"), false);
});

test("buildDemoReviewPlans uses natural Korean particles in visible content", () => {
  const [plan] = buildDemoReviewPlans([sampleMenus[0]], { limit: 1 });

  assert.match(plan.content, /탄탄멘과 추가밥/);
});

test("buildDemoReviewPlans uses natural Korean topic particles in titles", () => {
  const plans = buildDemoReviewPlans(
    [
      { id: "new-1", date: "2026-06-09", mealType: "LUNCH", items: ["설렁탕", "잡곡밥", "김치메밀전병"], imageUrl: null },
      { id: "new-2", date: "2026-06-08", mealType: "DINNER", items: ["해물누룽지탕", "잡곡밥", "칠리탕수육"], imageUrl: null },
      { id: "new-3", date: "2026-06-07", mealType: "LUNCH", items: ["간장닭불고기", "잡곡밥", "얼큰수제비국"], imageUrl: null },
      { id: "spam", date: "2026-06-06", mealType: "DINNER", items: ["스팸마요덮밥", "팽이버섯장국", "크래미볼튀김"], imageUrl: null }
    ],
    { limit: 4 }
  );

  const spamPlan = plans.find((plan) => plan.menuArchiveId === "spam");

  assert.equal(spamPlan?.title.includes("스팸마요덮밥은"), true);
  assert.equal(spamPlan?.title.includes("스팸마요덮밥는"), false);
});

test("buildDemoReviewPlans stores review image URLs as public paths", () => {
  const [plan] = buildDemoReviewPlans(
    [
      {
        id: "image-menu",
        date: "2026-06-09",
        mealType: "LUNCH",
        items: ["설렁탕", "잡곡밥", "김치메밀전병"],
        imageUrl: "C:\\Users\\smoun\\Jungle\\bob\\storage\\slack-meals\\images\\weekly.jpg"
      }
    ],
    { limit: 1 }
  );

  assert.equal(plan.imageUrl, "/api/menu-images/weekly.jpg");
});

test("seedDemoReviews replaces old demo reviews and creates comments and chunks", async () => {
  const calls: string[] = [];
  const reviewerIds: string[] = [];
  const commenterIds: string[] = [];
  const store: DemoReviewSeedStore = {
    async findMenus() {
      calls.push("findMenus");
      return sampleMenus;
    },
    async upsertSeedUsers() {
      calls.push("upsertSeedUsers");
      return {
        reviewers: [{ id: "reviewer-1" }, { id: "reviewer-2" }, { id: "reviewer-3" }],
        commenters: [{ id: "commenter-1" }, { id: "commenter-2" }, { id: "commenter-3" }]
      };
    },
    async deleteSeedReviews(authorIds) {
      calls.push(`deleteSeedReviews:${authorIds.join(",")}`);
      return 2;
    },
    async createReviewSeed(input) {
      reviewerIds.push(input.reviewerId);
      commenterIds.push(...input.commenterIds);
      calls.push(`createReviewSeed:${input.plan.menuArchiveId}:${input.plan.comments.length}`);
      return {
        reviewId: `review-${input.plan.seedKey}`,
        commentIds: input.plan.comments.map((_, index) => `comment-${index}`),
        chunkCount: 1 + input.plan.comments.length
      };
    }
  };

  const result = await seedDemoReviews(store, { limit: 2 });

  assert.deepEqual(calls.slice(0, 3), ["findMenus", "upsertSeedUsers", "deleteSeedReviews:reviewer-1,reviewer-2,reviewer-3"]);
  assert.equal(result.deletedReviewCount, 2);
  assert.equal(result.createdReviewCount, 2);
  assert.equal(result.createdCommentCount, 5);
  assert.equal(result.createdChunkCount, 7);
  assert.deepEqual(reviewerIds, ["reviewer-1", "reviewer-2"]);
  assert.ok(new Set(commenterIds).size > 1);
});

test("seedDemoReviews appends after existing demo reviews without deleting them", async () => {
  const calls: string[] = [];
  const createdTitles: string[] = [];
  const existingTitles = buildDemoReviewPlans(sampleMenus, { limit: 2 }).map((plan) => plan.title);
  const store: DemoReviewSeedStore = {
    async findMenus() {
      calls.push("findMenus");
      return sampleMenus;
    },
    async upsertSeedUsers() {
      calls.push("upsertSeedUsers");
      return {
        reviewers: [{ id: "reviewer-1" }, { id: "reviewer-2" }],
        commenters: [{ id: "commenter-1" }, { id: "commenter-2" }]
      };
    },
    async countSeedReviews(authorIds) {
      calls.push(`countSeedReviews:${authorIds.join(",")}`);
      return existingTitles.length;
    },
    async deleteSeedReviews() {
      throw new Error("append mode should not delete existing demo reviews");
    },
    async createReviewSeed(input) {
      createdTitles.push(input.plan.title);
      calls.push(`createReviewSeed:${input.plan.seedKey}`);
      return {
        reviewId: `review-${input.plan.seedKey}`,
        commentIds: input.plan.comments.map((_, index) => `comment-${index}`),
        chunkCount: 1 + input.plan.comments.length
      };
    }
  };

  const result = await seedDemoReviews(store, { limit: 2, mode: "append" });

  assert.deepEqual(calls.slice(0, 3), ["findMenus", "upsertSeedUsers", "countSeedReviews:reviewer-1,reviewer-2"]);
  assert.equal(result.deletedReviewCount, 0);
  assert.equal(result.createdReviewCount, 2);
  assert.equal(createdTitles.length, 2);
  assert.equal(createdTitles.some((title) => existingTitles.includes(title)), false);
});
