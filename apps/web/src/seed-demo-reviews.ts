import { randomUUID } from "node:crypto";
import { hashPassword } from "@junglebob/ai";
import { prisma } from "@junglebob/db";
import {
  buildCommentSeedChunkData,
  buildReviewSeedChunkData,
  seedDemoReviews,
  type DemoReviewPlan,
  type DemoReviewSeedMode,
  type DemoReviewSeedStore
} from "./features/demo-reviews/demo-review-seed.ts";

const SEED_REVIEWERS = [
  { email: "demo-reviewer@junglebob.local", name: "정글러 민수" },
  { email: "demo-reviewer-02@junglebob.local", name: "정글러 지은" },
  { email: "demo-reviewer-03@junglebob.local", name: "밥친구 현우" },
  { email: "demo-reviewer-04@junglebob.local", name: "메뉴탐험가 수빈" },
  { email: "demo-reviewer-05@junglebob.local", name: "점심러 태윤" },
  { email: "demo-reviewer-06@junglebob.local", name: "저녁파 은서" },
  { email: "demo-reviewer-07@junglebob.local", name: "든든파 지호" },
  { email: "demo-reviewer-08@junglebob.local", name: "국밥러 하린" },
  { email: "demo-reviewer-09@junglebob.local", name: "밥심 준서" },
  { email: "demo-reviewer-10@junglebob.local", name: "매운맛 유나" },
  { email: "demo-reviewer-11@junglebob.local", name: "샐러드파 서윤" },
  { email: "demo-reviewer-12@junglebob.local", name: "면러 도윤" },
  { email: "demo-reviewer-13@junglebob.local", name: "집밥파 채원" },
  { email: "demo-reviewer-14@junglebob.local", name: "반찬러 민재" },
  { email: "demo-reviewer-15@junglebob.local", name: "한끼기록 소연" },
  { email: "demo-reviewer-16@junglebob.local", name: "식판러 유진" },
  { email: "demo-reviewer-17@junglebob.local", name: "간단파 시우" },
  { email: "demo-reviewer-18@junglebob.local", name: "든든후기 다은" },
  { email: "demo-reviewer-19@junglebob.local", name: "야식참는 지훈" },
  { email: "demo-reviewer-20@junglebob.local", name: "점심메모 예린" },
  { email: "demo-reviewer-21@junglebob.local", name: "밥상평론 도하" },
  { email: "demo-reviewer-22@junglebob.local", name: "김치파 나은" },
  { email: "demo-reviewer-23@junglebob.local", name: "국물파 준호" },
  { email: "demo-reviewer-24@junglebob.local", name: "소스파 라온" },
  { email: "demo-reviewer-25@junglebob.local", name: "정글밥 지민" }
];
const SEED_COMMENTERS = [
  { email: "demo-commenter@junglebob.local", name: "정글러 지은" },
  { email: "demo-commenter-02@junglebob.local", name: "밥친구 민재" },
  { email: "demo-commenter-03@junglebob.local", name: "점심메이트 서연" },
  { email: "demo-commenter-04@junglebob.local", name: "국물좋아 현서" },
  { email: "demo-commenter-05@junglebob.local", name: "덜매운파 유진" },
  { email: "demo-commenter-06@junglebob.local", name: "반찬보는 도윤" },
  { email: "demo-commenter-07@junglebob.local", name: "밥양체크 하준" },
  { email: "demo-commenter-08@junglebob.local", name: "메뉴기록 나연" },
  { email: "demo-commenter-09@junglebob.local", name: "간식참는 준영" },
  { email: "demo-commenter-10@junglebob.local", name: "면좋아 수아" },
  { email: "demo-commenter-11@junglebob.local", name: "든든러 시온" },
  { email: "demo-commenter-12@junglebob.local", name: "샐러드보는 예나" },
  { email: "demo-commenter-13@junglebob.local", name: "한입평가 지우" },
  { email: "demo-commenter-14@junglebob.local", name: "매콤체크 태현" },
  { email: "demo-commenter-15@junglebob.local", name: "밥친구 아린" },
  { email: "demo-commenter-16@junglebob.local", name: "메뉴추천 소민" },
  { email: "demo-commenter-17@junglebob.local", name: "저녁고민 준" },
  { email: "demo-commenter-18@junglebob.local", name: "국밥메모 은우" },
  { email: "demo-commenter-19@junglebob.local", name: "식판메이트 하은" },
  { email: "demo-commenter-20@junglebob.local", name: "가성비보는 도하" },
  { email: "demo-commenter-21@junglebob.local", name: "재방문파 윤서" },
  { email: "demo-commenter-22@junglebob.local", name: "김치좋아 민서" },
  { email: "demo-commenter-23@junglebob.local", name: "밥심채우는 지민" },
  { email: "demo-commenter-24@junglebob.local", name: "오늘뭐먹지 현우" },
  { email: "demo-commenter-25@junglebob.local", name: "국물파 수현" },
  { email: "demo-commenter-26@junglebob.local", name: "반찬파 다현" },
  { email: "demo-commenter-27@junglebob.local", name: "점심기록 준서" },
  { email: "demo-commenter-28@junglebob.local", name: "한끼메모 라희" },
  { email: "demo-commenter-29@junglebob.local", name: "면식러 태오" },
  { email: "demo-commenter-30@junglebob.local", name: "든든체크 은서" }
];
const ARTIFACT_AUTHOR_NAMES = ["rag-user", "comment-user", "review-demo"];
const ARTIFACT_REVIEW_TITLES = ["RAG chunk review", "Comment test review"];

const limit = parsePositiveInt(process.env.DEMO_REVIEW_SEED_LIMIT);
const mode = parseSeedMode(process.env.DEMO_REVIEW_SEED_MODE);

const store: DemoReviewSeedStore = {
  async findMenus() {
    const menus = await prisma.menuArchive.findMany({
      where: {
        imageType: "MEAL_PHOTO"
      },
      orderBy: [{ date: "asc" }, { mealType: "asc" }],
      select: {
        id: true,
        date: true,
        mealType: true,
        items: true,
        imageUrl: true
      }
    });

    return menus.map((menu) => ({
      id: menu.id,
      date: menu.date,
      mealType: menu.mealType,
      items: menu.items,
      imageUrl: menu.imageUrl
    }));
  },

  async upsertSeedUsers() {
    const passwordHash = await hashPassword(randomUUID());
    const [reviewers, commenters] = await Promise.all([
      Promise.all(SEED_REVIEWERS.map((user) => upsertSeedUser(user.email, user.name, passwordHash))),
      Promise.all(SEED_COMMENTERS.map((user) => upsertSeedUser(user.email, user.name, passwordHash)))
    ]);

    return { reviewers, commenters };
  },

  async countSeedReviews(authorIds) {
    return prisma.review.count({
      where: {
        authorId: { in: authorIds }
      }
    });
  },

  async deleteSeedReviews(authorIds) {
    const result = await prisma.review.deleteMany({
      where: {
        OR: [
          { authorId: { in: authorIds } },
          { title: { startsWith: "[데모]" } },
          { title: { in: ARTIFACT_REVIEW_TITLES } },
          { menuNames: { has: "RagMenu" } },
          { menuNames: { has: "Jeyuk" } },
          {
            author: {
              is: {
                name: {
                  in: ARTIFACT_AUTHOR_NAMES
                }
              }
            }
          }
        ]
      }
    });

    return result.count;
  },

  async createReviewSeed(input) {
    return prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: {
          authorId: input.reviewerId,
          menuArchiveId: input.plan.menuArchiveId,
          title: input.plan.title,
          content: input.plan.content,
          rating: input.plan.rating,
          imageUrl: input.plan.imageUrl,
          menuNames: input.plan.menuNames,
          createdAt: input.plan.createdAt,
          tags: {
            create: input.plan.tags.map((name) => ({
              tag: {
                connectOrCreate: {
                  where: { name },
                  create: { name }
                }
              }
            }))
          }
        },
        select: {
          id: true,
          title: true
        }
      });

      await tx.reviewChunk.create({
        data: buildReviewSeedChunkData(input.plan, review.id)
      });

      const commentIds: string[] = [];
      let chunkCount = 1;

      for (const [index, content] of input.plan.comments.entries()) {
        const comment = await tx.comment.create({
          data: {
            reviewId: review.id,
            authorId: input.commenterIds[index % input.commenterIds.length],
            content,
            createdAt: commentCreatedAt(input.plan, index)
          },
          select: {
            id: true
          }
        });

        await tx.reviewChunk.create({
          data: buildCommentSeedChunkData({
            commentId: comment.id,
            reviewId: review.id,
            reviewTitle: review.title,
            content
          })
        });

        commentIds.push(comment.id);
        chunkCount += 1;
      }

      return {
        reviewId: review.id,
        commentIds,
        chunkCount
      };
    });
  }
};

try {
  const result = await seedDemoReviews(store, {
    ...(limit ? { limit } : {}),
    ...(mode ? { mode } : {})
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
}

function parsePositiveInt(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseSeedMode(value: string | undefined): DemoReviewSeedMode | undefined {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  if (normalized === "replace" || normalized === "append") {
    return normalized;
  }

  throw new Error("DEMO_REVIEW_SEED_MODE must be replace or append");
}

function upsertSeedUser(email: string, name: string, passwordHash: string) {
  return prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash
    },
    create: {
      email,
      name,
      passwordHash
    },
    select: { id: true }
  });
}

function commentCreatedAt(plan: DemoReviewPlan, index: number): Date {
  return new Date(plan.createdAt.getTime() + (index + 1) * 60 * 1000);
}
