import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, type AiVerdict, type VoteType } from "../src/generated/prisma/client";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/jungle_snack_court?schema=public";

const prisma = new PrismaClient({
  adapter: new PrismaPg(connectionString),
});

const seedUsers = [
  {
    id: "seed-user-jungle-foodie",
    name: "정글식객",
    email: "seed-jungle-foodie@jungle-snack-court.local",
    image: "https://api.dicebear.com/9.x/thumbs/svg?seed=jungle-foodie",
  },
  {
    id: "seed-user-protein-lawyer",
    name: "단백질변호사",
    email: "seed-protein-lawyer@jungle-snack-court.local",
    image: "https://api.dicebear.com/9.x/thumbs/svg?seed=protein-lawyer",
  },
  {
    id: "seed-user-night-prosecutor",
    name: "야식검사",
    email: "seed-night-prosecutor@jungle-snack-court.local",
    image: "https://api.dicebear.com/9.x/thumbs/svg?seed=night-prosecutor",
  },
];

const seedUserIds = seedUsers.map((user) => user.id);
const seedUserEmails = seedUsers.map((user) => user.email);

const seedTags = ["운동후", "저녁패스", "당충전", "단백질", "정당방위"];

const seedMealPosts = [
  {
    id: "seed-meal-post-weekly",
    kakaoPostId: "seed-kakao-weekly-20350115",
    title: "1월 3주차 식단표",
    permalink: "https://pf.kakao.com/_xhzNjn/posts/seed-weekly-20350115",
    imageUrl: "https://picsum.photos/seed/jungle-meal-weekly/900/675",
    rawJson: {
      seed: true,
      title: "1월 3주차 식단표",
      contents: [{ t: "text", v: "seed weekly meal table" }],
    },
    postType: "WEEKLY_TABLE" as const,
    publishedAt: new Date("2035-01-13T01:00:00.000Z"),
  },
  {
    id: "seed-meal-post-daily",
    kakaoPostId: "seed-kakao-daily-20350115",
    title: "1월 15일(월) 중식 메뉴",
    permalink: "https://pf.kakao.com/_xhzNjn/posts/seed-daily-20350115",
    imageUrl: "https://picsum.photos/seed/jungle-meal-daily/900/675",
    rawJson: {
      seed: true,
      title: "1월 15일(월) 중식 메뉴",
      contents: [{ t: "text", v: "닭가슴살 샐러드\n현미밥\n미역국" }],
    },
    postType: "DAILY_MENU" as const,
    publishedAt: new Date("2035-01-15T01:00:00.000Z"),
  },
];

const seedMealMenus = [
  {
    id: "seed-meal-menu-lunch",
    mealDate: new Date("2035-01-15T00:00:00.000Z"),
    mealType: "LUNCH" as const,
    menuText: "닭가슴살 샐러드\n현미밥\n미역국\n방울토마토",
    imageUrl: "https://picsum.photos/seed/jungle-lunch-menu/900/675",
    sourcePostId: "seed-meal-post-daily",
  },
  {
    id: "seed-meal-menu-dinner",
    mealDate: new Date("2035-01-15T00:00:00.000Z"),
    mealType: "DINNER" as const,
    menuText: "제육볶음\n잡곡밥\n계란찜\n김치",
    imageUrl: "https://picsum.photos/seed/jungle-dinner-menu/900/675",
    sourcePostId: "seed-meal-post-weekly",
  },
];

const seedPosts = [
  {
    id: "seed-post-no-image",
    authorId: "seed-user-jungle-foodie",
    snackName: "편의점 삼각김밥",
    reason: "알고리즘 문제를 풀다가 점심 시간이 40분 밀렸습니다. 이건 간식이라기보다 긴급 보급입니다.",
    ateLunch: false,
    ateDinner: false,
    tags: ["정당방위"],
    imageCount: 0,
    createdAtOffsetMinutes: 5,
  },
  {
    id: "seed-post-single-image",
    authorId: "seed-user-protein-lawyer",
    snackName: "초코우유",
    reason: "세그먼트 트리에서 정신력이 빠져나가서 당을 보충했습니다. 증거 사진은 한 장입니다.",
    ateLunch: true,
    ateDinner: true,
    tags: ["당충전"],
    imageCount: 1,
    createdAtOffsetMinutes: 20,
  },
  {
    id: "seed-post-multi-image",
    authorId: "seed-user-night-prosecutor",
    snackName: "닭가슴살 칩 3종",
    reason: "운동 후 단백질 보충이라는 명목으로 맛 비교 실험을 진행했습니다.",
    ateLunch: true,
    ateDinner: true,
    tags: ["운동후", "단백질"],
    imageCount: 3,
    createdAtOffsetMinutes: 45,
  },
  {
    id: "seed-post-skip-dinner",
    authorId: "seed-user-jungle-foodie",
    snackName: "컵라면 작은 컵",
    reason: "점심은 먹었지만 저녁을 놓쳤고, 밤 디버깅은 빈속으로 하면 판례상 위험합니다.",
    ateLunch: true,
    ateDinner: false,
    tags: ["저녁패스", "정당방위"],
    imageCount: 1,
    createdAtOffsetMinutes: 80,
  },
  {
    id: "seed-post-meal-context",
    authorId: "seed-user-protein-lawyer",
    snackName: "프로틴바",
    reason: "중식 메뉴는 먹었지만 석식을 건너뛴 상태라, 회의 전 최소한의 방어권을 행사했습니다.",
    ateLunch: true,
    ateDinner: false,
    tags: ["단백질", "저녁패스"],
    imageCount: 2,
    createdAtOffsetMinutes: 120,
  },
];

const seedPostIds = seedPosts.map((post) => post.id);

const seedComments = [
  ["seed-comment-1-1", "seed-post-no-image", "seed-user-protein-lawyer", "긴급 보급이면 형량이 많이 낮아집니다.", 4],
  ["seed-comment-1-2", "seed-post-no-image", "seed-user-night-prosecutor", "삼각김밥은 식사 쪽에 가깝다는 의견입니다.", 1],
  ["seed-comment-2-1", "seed-post-single-image", "seed-user-jungle-foodie", "초코우유는 당 충전 증거가 명확합니다.", 3],
  ["seed-comment-2-2", "seed-post-single-image", "seed-user-night-prosecutor", "사진 한 장으로는 정상참작 가능합니다.", 2],
  ["seed-comment-2-3", "seed-post-single-image", "seed-user-protein-lawyer", "다음에는 물도 같이 드세요.", 0],
  ["seed-comment-3-1", "seed-post-multi-image", "seed-user-jungle-foodie", "3종 비교 실험이면 연구 활동 아닙니까?", 5],
  ["seed-comment-3-2", "seed-post-multi-image", "seed-user-protein-lawyer", "운동 후라면 무죄 쪽으로 갑니다.", 4],
  ["seed-comment-3-3", "seed-post-multi-image", "seed-user-night-prosecutor", "다만 3종은 약간 과학수사의 냄새가 납니다.", 2],
  ["seed-comment-4-1", "seed-post-skip-dinner", "seed-user-protein-lawyer", "저녁 패스는 매우 강한 참작 사유입니다.", 5],
  ["seed-comment-4-2", "seed-post-skip-dinner", "seed-user-night-prosecutor", "작은 컵이면 집행유예 가능합니다.", 3],
  ["seed-comment-4-3", "seed-post-skip-dinner", "seed-user-jungle-foodie", "밤 디버깅은 예외 조항이 필요합니다.", 1],
  ["seed-comment-4-4", "seed-post-skip-dinner", "seed-user-protein-lawyer", "국물까지 다 마셨는지는 쟁점입니다.", 0],
  ["seed-comment-5-1", "seed-post-meal-context", "seed-user-jungle-foodie", "식단 맥락이 붙어서 판결이 쉬워졌습니다.", 4],
  ["seed-comment-5-2", "seed-post-meal-context", "seed-user-night-prosecutor", "석식 패스라면 프로틴바는 방어권입니다.", 5],
  ["seed-comment-5-3", "seed-post-meal-context", "seed-user-protein-lawyer", "중식은 먹었으니 완전 무죄까지는 고민됩니다.", 2],
] as const;

const seedCommentIds = seedComments.map(([id]) => id);

const seedVotes = [
  ["seed-vote-1-1", "seed-post-no-image", "seed-user-jungle-foodie", "NOT_GUILTY_BY_CONTEXT"],
  ["seed-vote-1-2", "seed-post-no-image", "seed-user-protein-lawyer", "INNOCENT"],
  ["seed-vote-1-3", "seed-post-no-image", "seed-user-night-prosecutor", "PROBATION"],
  ["seed-vote-2-1", "seed-post-single-image", "seed-user-jungle-foodie", "PROBATION"],
  ["seed-vote-2-2", "seed-post-single-image", "seed-user-protein-lawyer", "GUILTY_BUT_UNDERSTANDABLE"],
  ["seed-vote-2-3", "seed-post-single-image", "seed-user-night-prosecutor", "NEEDS_MORE_EXCUSE"],
  ["seed-vote-3-1", "seed-post-multi-image", "seed-user-jungle-foodie", "INNOCENT"],
  ["seed-vote-3-2", "seed-post-multi-image", "seed-user-protein-lawyer", "NOT_GUILTY_BY_CONTEXT"],
  ["seed-vote-3-3", "seed-post-multi-image", "seed-user-night-prosecutor", "GUILTY_BUT_UNDERSTANDABLE"],
  ["seed-vote-4-1", "seed-post-skip-dinner", "seed-user-jungle-foodie", "NOT_GUILTY_BY_CONTEXT"],
  ["seed-vote-4-2", "seed-post-skip-dinner", "seed-user-protein-lawyer", "PROBATION"],
  ["seed-vote-4-3", "seed-post-skip-dinner", "seed-user-night-prosecutor", "INNOCENT"],
  ["seed-vote-5-1", "seed-post-meal-context", "seed-user-jungle-foodie", "PROBATION"],
  ["seed-vote-5-2", "seed-post-meal-context", "seed-user-protein-lawyer", "GUILTY_BUT_UNDERSTANDABLE"],
  ["seed-vote-5-3", "seed-post-meal-context", "seed-user-night-prosecutor", "NOT_GUILTY_BY_CONTEXT"],
] as const satisfies ReadonlyArray<readonly [string, string, string, VoteType]>;

const seedAiJudgements = [
  {
    id: "seed-ai-judgement-1",
    postId: "seed-post-single-image",
    verdict: "PROBATION" as AiVerdict,
    title: "초코우유 당 충전 사건",
    summary: "문제 풀이 집중력이 떨어진 상황에서 한 병의 당 보충은 정상참작 사유가 있습니다.",
    reasoning: "점심과 저녁을 모두 먹었으므로 완전 무죄는 어렵지만, 과한 비난 없이 작은 보급으로 볼 수 있습니다.",
    recommendation: "다음 사건에서는 물 한 컵을 함께 제출하면 더 설득력 있습니다.",
    confidence: 0.72,
  },
  {
    id: "seed-ai-judgement-2",
    postId: "seed-post-multi-image",
    verdict: "INNOCENT" as AiVerdict,
    title: "운동 후 단백질 칩 비교 실험",
    summary: "운동 후 보충과 맛 비교라는 연구성이 함께 있어 무죄에 가깝습니다.",
    reasoning: "이미지를 여러 장 제출했고 태그와 이유가 일관됩니다. 다만 3종 비교는 즐거움이 섞였음을 법정도 알고 있습니다.",
    recommendation: "다음에는 가장 맛있었던 한 봉지를 판례로 남기십시오.",
    confidence: 0.84,
  },
  {
    id: "seed-ai-judgement-3",
    postId: "seed-post-meal-context",
    verdict: "GUILTY_BUT_UNDERSTANDABLE" as AiVerdict,
    title: "석식 패스 프로틴바 사건",
    summary: "중식은 먹었지만 석식을 건너뛴 맥락이 있어 유죄지만 정상참작됩니다.",
    reasoning: "식단 맥락과 식사 여부가 분명합니다. 회의 전 최소 보급이라는 설명도 설득력이 있습니다.",
    recommendation: "회의가 길어질 때는 작은 간식 하나로 합의하십시오.",
    confidence: 0.78,
  },
];

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.aiJudgement.deleteMany({
      where: {
        OR: [
          { id: { in: seedAiJudgements.map((judgement) => judgement.id) } },
          { postId: { in: seedPostIds } },
        ],
      },
    });
    await tx.commentLike.deleteMany({
      where: {
        OR: [{ commentId: { in: seedCommentIds } }, { userId: { in: seedUserIds } }],
      },
    });
    await tx.comment.deleteMany({
      where: {
        OR: [
          { id: { in: seedCommentIds } },
          { postId: { in: seedPostIds } },
          { authorId: { in: seedUserIds } },
        ],
      },
    });
    await tx.vote.deleteMany({
      where: {
        OR: [{ postId: { in: seedPostIds } }, { userId: { in: seedUserIds } }],
      },
    });
    await tx.postMealContext.deleteMany({
      where: {
        postId: { in: seedPostIds },
      },
    });
    await tx.postImage.deleteMany({
      where: {
        postId: { in: seedPostIds },
      },
    });
    await tx.postTag.deleteMany({
      where: {
        postId: { in: seedPostIds },
      },
    });
    await tx.post.deleteMany({
      where: {
        id: { in: seedPostIds },
      },
    });
    await tx.notificationEvent.deleteMany({
      where: {
        userId: { in: seedUserIds },
      },
    });
    await tx.session.deleteMany({
      where: {
        userId: { in: seedUserIds },
      },
    });
    await tx.account.deleteMany({
      where: {
        userId: { in: seedUserIds },
      },
    });
    await tx.user.deleteMany({
      where: {
        OR: [{ id: { in: seedUserIds } }, { email: { in: seedUserEmails } }],
      },
    });
    await tx.postMealContext.deleteMany({
      where: {
        OR: [
          { lunchMenuId: { in: seedMealMenus.map((meal) => meal.id) } },
          { dinnerMenuId: { in: seedMealMenus.map((meal) => meal.id) } },
        ],
      },
    });
    await tx.mealMenu.deleteMany({
      where: {
        id: { in: seedMealMenus.map((meal) => meal.id) },
      },
    });
    await tx.mealPost.deleteMany({
      where: {
        kakaoPostId: { in: seedMealPosts.map((post) => post.kakaoPostId) },
      },
    });

    await tx.user.createMany({
      data: seedUsers,
    });

    for (const tag of seedTags) {
      await tx.tag.upsert({
        where: { name: tag },
        create: { name: tag },
        update: {},
      });
    }

    for (const mealPost of seedMealPosts) {
      await tx.mealPost.create({
        data: {
          ...mealPost,
          crawledAt: new Date(),
        },
      });
    }

    for (const mealMenu of seedMealMenus) {
      await tx.mealMenu.create({
        data: mealMenu,
      });
    }

    for (const post of seedPosts) {
      await tx.post.create({
        data: {
          id: post.id,
          authorId: post.authorId,
          snackName: post.snackName,
          reason: post.reason,
          ateLunch: post.ateLunch,
          ateDinner: post.ateDinner,
          status: "PUBLISHED",
          visibility: "PUBLIC",
          createdAt: minutesAgo(post.createdAtOffsetMinutes),
          images: {
            create: Array.from({ length: post.imageCount }, (_, index) => ({
              url: `https://picsum.photos/seed/${post.id}-${index + 1}/900/675`,
              filename: `${post.id}-${index + 1}.jpg`,
              contentType: "image/jpeg",
              size: 180_000 + index * 24_000,
              sortOrder: index,
              storageType: "EXTERNAL",
              sourceUrl: "https://picsum.photos",
              altText: `${post.snackName} seed image ${index + 1}`,
              width: 900,
              height: 675,
              metadata: {
                provider: "Picsum",
                sourceName: `${post.id}-${index + 1}`,
                licenseNote: "Seed placeholder image.",
              },
            })),
          },
          tags: {
            create: post.tags.map((name) => ({
              tag: {
                connect: { name },
              },
            })),
          },
        },
      });
    }

    await tx.postMealContext.create({
      data: {
        id: "seed-post-meal-context-link",
        postId: "seed-post-meal-context",
        lunchMenuId: "seed-meal-menu-lunch",
        dinnerMenuId: "seed-meal-menu-dinner",
        ateLunch: true,
        ateDinner: false,
        mealNote: "seed: 중식은 먹었고 석식은 회의 때문에 건너뛴 상황",
      },
    });

    await tx.vote.createMany({
      data: seedVotes.map(([id, postId, userId, type]) => ({
        id,
        postId,
        userId,
        type,
      })),
    });

    await tx.comment.createMany({
      data: seedComments.map(([id, postId, authorId, content], index) => ({
        id,
        postId,
        authorId,
        content,
        status: "PUBLISHED",
        createdAt: minutesAgo(10 + index * 3),
      })),
    });

    await tx.commentLike.createMany({
      data: buildCommentLikes(),
      skipDuplicates: true,
    });

    for (const judgement of seedAiJudgements) {
      await tx.aiJudgement.create({
        data: {
          id: judgement.id,
          postId: judgement.postId,
          modelName: "seed-gpt-5.5-placeholder",
          promptVersion: "seed-snack-judge-v1",
          verdict: judgement.verdict,
          summary: judgement.summary,
          reasoning: judgement.reasoning,
          rawJson: {
            verdict: judgement.verdict,
            title: judgement.title,
            summary: judgement.summary,
            reasoning: judgement.reasoning,
            recommendation: judgement.recommendation,
            confidence: judgement.confidence,
            seed: true,
          },
          createdAt: minutesAgo(3),
        },
      });
    }
  });

  console.log(
    [
      "Seed completed:",
      `${seedUsers.length} users`,
      `${seedPosts.length} posts`,
      `${seedComments.length} comments`,
      `${seedVotes.length} votes`,
      `${seedMealMenus.length} meal menus`,
      `${seedAiJudgements.length} AI judgements`,
    ].join(" "),
  );
}

function buildCommentLikes() {
  const likes: Array<{ commentId: string; userId: string }> = [];

  for (const [commentId, , authorId, , likeCount] of seedComments) {
    const likers = seedUserIds.filter((userId) => userId !== authorId).slice(0, likeCount);

    for (const userId of likers) {
      likes.push({ commentId, userId });
    }
  }

  return likes;
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
