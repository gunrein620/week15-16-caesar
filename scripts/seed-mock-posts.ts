import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, type AiVerdict, type VoteType } from "../src/generated/prisma/client";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/jungle_snack_court?schema=public";

const prisma = new PrismaClient({
  adapter: new PrismaPg(connectionString),
});

const mockUsers = [
  {
    id: "mock-user-jungle-foodie",
    name: "정글식객",
    email: "mock-jungle-foodie@jungle-snack-court.local",
    image: "https://api.dicebear.com/9.x/thumbs/svg?seed=mock-jungle-foodie",
  },
  {
    id: "mock-user-protein-lawyer",
    name: "단백질변호사",
    email: "mock-protein-lawyer@jungle-snack-court.local",
    image: "https://api.dicebear.com/9.x/thumbs/svg?seed=mock-protein-lawyer",
  },
  {
    id: "mock-user-night-prosecutor",
    name: "야식검사",
    email: "mock-night-prosecutor@jungle-snack-court.local",
    image: "https://api.dicebear.com/9.x/thumbs/svg?seed=mock-night-prosecutor",
  },
  {
    id: "mock-user-bug-hunter",
    name: "버그헌터",
    email: "mock-bug-hunter@jungle-snack-court.local",
    image: "https://api.dicebear.com/9.x/thumbs/svg?seed=mock-bug-hunter",
  },
  {
    id: "mock-user-stack-judge",
    name: "스택판사",
    email: "mock-stack-judge@jungle-snack-court.local",
    image: "https://api.dicebear.com/9.x/thumbs/svg?seed=mock-stack-judge",
  },
];

const mockUserIds = mockUsers.map((user) => user.id);
const mockUserEmails = mockUsers.map((user) => user.email);

const mockTags = [
  "운동후",
  "저녁패스",
  "당충전",
  "단백질",
  "정당방위",
  "야식재판",
  "디버깅",
  "식단맥락",
  "커피동반",
  "집중보급",
];

type MainPostDraft = {
  dateKey: "today" | "friday" | "saturday";
  time: string;
  id: string;
  authorId: string;
  snackName: string;
  reason: string;
  ateLunch: boolean;
  ateDinner: boolean;
  tags: string[];
  imageCount: number;
  meal?: "lunch" | "dinner";
  verdict: VoteType;
};

type MockImageDraft = {
  url: string;
  filename: string;
  contentType: string;
  size: number;
  sortOrder: number;
  sourceUrl: string;
  altText: string;
  width: number;
  height: number;
  metadata: {
    provider: string;
    sourceName: string;
    licenseNote: string;
  };
};

const mainPostDrafts = [
  {
    dateKey: "today",
    time: "09:18",
    id: "mock-main-today-1",
    authorId: "mock-user-jungle-foodie",
    snackName: "아이스 아메리카노와 미니 약과",
    reason: "오전 DP 문제에서 멘탈이 재귀로 빠져나가서 당과 카페인을 같이 증거로 제출합니다.",
    ateLunch: false,
    ateDinner: false,
    tags: ["당충전", "집중보급"],
    imageCount: 1,
    verdict: "PROBATION",
  },
  {
    dateKey: "today",
    time: "13:42",
    id: "mock-main-today-2",
    authorId: "mock-user-protein-lawyer",
    snackName: "삶은 달걀 2개",
    reason: "점심은 먹었지만 운동 전이라 단백질 예열이 필요했습니다. 과자보다 담백하니 선처 바랍니다.",
    ateLunch: true,
    ateDinner: false,
    tags: ["운동후", "단백질", "정당방위"],
    imageCount: 0,
    meal: "lunch",
    verdict: "INNOCENT",
  },
  {
    dateKey: "today",
    time: "21:07",
    id: "mock-main-today-3",
    authorId: "mock-user-night-prosecutor",
    snackName: "컵누들 매콤한맛",
    reason: "저녁을 놓친 채 팀 회의가 길어졌고, 빈속으로 회의록을 쓰는 것은 법정도 가혹하다고 봅니다.",
    ateLunch: true,
    ateDinner: false,
    tags: ["저녁패스", "야식재판", "정당방위"],
    imageCount: 1,
    meal: "dinner",
    verdict: "NOT_GUILTY_BY_CONTEXT",
  },
  {
    dateKey: "friday",
    time: "10:35",
    id: "mock-main-friday-1",
    authorId: "mock-user-bug-hunter",
    snackName: "초코바 반 개",
    reason: "금요일 오전 빌드 에러가 3연속이라 반 개만 먹었습니다. 나머지 반은 증거물로 보존했습니다.",
    ateLunch: false,
    ateDinner: false,
    tags: ["당충전", "디버깅"],
    imageCount: 1,
    verdict: "GUILTY_BUT_UNDERSTANDABLE",
  },
  {
    dateKey: "friday",
    time: "15:20",
    id: "mock-main-friday-2",
    authorId: "mock-user-stack-judge",
    snackName: "그릭요거트와 그래놀라",
    reason: "오후 집중력이 바닥나기 전에 미리 방어했습니다. 달지만 식사 사이 보급으로 봐주세요.",
    ateLunch: true,
    ateDinner: false,
    tags: ["식단맥락", "집중보급"],
    imageCount: 2,
    meal: "lunch",
    verdict: "INNOCENT",
  },
  {
    dateKey: "friday",
    time: "22:10",
    id: "mock-main-friday-3",
    authorId: "mock-user-jungle-foodie",
    snackName: "편의점 닭가슴살 소시지",
    reason: "금요일 밤 알고리즘 스터디 후 허기가 왔고, 단백질 위주라 정상참작을 청구합니다.",
    ateLunch: true,
    ateDinner: true,
    tags: ["단백질", "야식재판"],
    imageCount: 1,
    verdict: "PROBATION",
  },
  {
    dateKey: "saturday",
    time: "11:05",
    id: "mock-main-saturday-1",
    authorId: "mock-user-protein-lawyer",
    snackName: "바나나와 두유",
    reason: "토요일 오전 러닝 전 에너지 보급입니다. 기록 향상을 위한 선의의 섭취였습니다.",
    ateLunch: false,
    ateDinner: false,
    tags: ["운동후", "단백질", "정당방위"],
    imageCount: 1,
    verdict: "INNOCENT",
  },
  {
    dateKey: "saturday",
    time: "16:33",
    id: "mock-main-saturday-2",
    authorId: "mock-user-night-prosecutor",
    snackName: "감자칩 작은 봉지",
    reason: "주말 리팩토링 중 손이 심심했습니다. 작은 봉지라는 점만 참작해 주세요.",
    ateLunch: true,
    ateDinner: false,
    tags: ["야식재판", "디버깅"],
    imageCount: 2,
    verdict: "NEEDS_MORE_EXCUSE",
  },
  {
    dateKey: "saturday",
    time: "20:48",
    id: "mock-main-saturday-3",
    authorId: "mock-user-bug-hunter",
    snackName: "치즈김밥",
    reason: "저녁 메뉴를 놓쳤고 토요일 배포 전 마지막 연료였습니다. 이건 간식과 식사의 경계 사건입니다.",
    ateLunch: true,
    ateDinner: false,
    tags: ["저녁패스", "식단맥락", "정당방위"],
    imageCount: 1,
    meal: "dinner",
    verdict: "GUILTY_BUT_UNDERSTANDABLE",
  },
] satisfies MainPostDraft[];

const precedentPostDrafts = [
  ["mock-precedent-01", "포카칩 어니언", "배열 인덱스가 계속 한 칸씩 밀려서 바삭한 교정 장치가 필요했습니다.", "mock-user-night-prosecutor", ["디버깅", "야식재판"], 1, "GUILTY_BUT_UNDERSTANDABLE", -1, "23:12"],
  ["mock-precedent-02", "프로틴 쉐이크", "운동 후 스터디에 바로 들어와서 회복 보급으로 제출합니다.", "mock-user-protein-lawyer", ["운동후", "단백질"], 0, "INNOCENT", -2, "18:30"],
  ["mock-precedent-03", "초코우유", "세그먼트 트리 발표 직전 손이 떨려서 당을 보충했습니다.", "mock-user-jungle-foodie", ["당충전", "집중보급"], 1, "PROBATION", -3, "14:05"],
  ["mock-precedent-04", "미니 붕어빵 3개", "비 오는 날 컨디션이 축축해서 사기 진작 목적으로 먹었습니다.", "mock-user-stack-judge", ["정당방위"], 2, "GUILTY_BUT_UNDERSTANDABLE", -4, "20:15"],
  ["mock-precedent-05", "참치마요 삼각김밥", "점심을 못 먹고 네트워크 실습에 들어갔습니다. 식사 대체 판례로 봐주세요.", "mock-user-bug-hunter", ["저녁패스", "식단맥락"], 1, "NOT_GUILTY_BY_CONTEXT", -5, "12:50"],
  ["mock-precedent-06", "아몬드 한 줌", "긴 강의 사이 허기를 막기 위한 소량 보급입니다.", "mock-user-jungle-foodie", ["집중보급", "정당방위"], 0, "INNOCENT", -6, "16:00"],
  ["mock-precedent-07", "젤리 한 봉지", "테스트 케이스가 전부 빨간색이라 색을 맞춰 먹었습니다.", "mock-user-night-prosecutor", ["당충전", "디버깅"], 1, "NEEDS_MORE_EXCUSE", -7, "19:40"],
  ["mock-precedent-08", "훈제란과 탄산수", "저녁 전까지 버티기 위한 최소 구성입니다.", "mock-user-protein-lawyer", ["단백질", "식단맥락"], 0, "PROBATION", -8, "17:22"],
  ["mock-precedent-09", "핫바", "새벽 코드 리뷰 중 체온과 의지를 동시에 올리려 했습니다.", "mock-user-bug-hunter", ["야식재판", "정당방위"], 1, "GUILTY_BUT_UNDERSTANDABLE", -9, "01:25"],
  ["mock-precedent-10", "고구마 말랭이", "주말 모의 면접 전에 조용한 탄수화물 보급이 필요했습니다.", "mock-user-stack-judge", ["집중보급", "식단맥락"], 2, "INNOCENT", -10, "10:10"],
] as const satisfies ReadonlyArray<
  readonly [
    string,
    string,
    string,
    string,
    readonly string[],
    number,
    VoteType,
    number,
    string,
  ]
>;

const mockImageSourcesByPostId: Record<string, MockImageDraft[]> = {
  "mock-main-today-1": [
    commonsImage("Espresso_Americano.jpeg", "Iced americano in a clear glass"),
    commonsImage(
      "KOCIS_yakgwa, honey cookies (4646996556).jpg",
      "Korean yakgwa honey cookies stacked in a bowl",
    ),
  ],
  "mock-main-today-2": [
    externalImage(
      "https://source.unsplash.com/1200x900/?boiled-eggs",
      "https://unsplash.com/s/photos/boiled-eggs",
      "mock-main-today-2-boiled-eggs.jpg",
      "Boiled eggs cut open on a plate",
      "Unsplash Source",
    ),
  ],
  "mock-main-today-3": [
    externalImage(
      "https://source.unsplash.com/1200x900/?spicy-cup-noodles,ramen",
      "https://unsplash.com/s/photos/spicy-cup-noodles-ramen",
      "mock-main-today-3-cup-noodles.jpg",
      "Spicy cup noodles with red broth",
      "Unsplash Source",
    ),
  ],
  "mock-main-friday-1": [
    externalImage(
      "https://source.unsplash.com/1200x900/?chocolate-bar",
      "https://unsplash.com/s/photos/chocolate-bar",
      "mock-main-friday-1-chocolate-bar.jpg",
      "Milk chocolate bar pieces",
      "Unsplash Source",
    ),
  ],
  "mock-main-friday-2": [
    externalImage(
      "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=1200&q=80",
      "https://unsplash.com/photos/yogurt-bowl-1488477181946-6428a0291777",
      "mock-main-friday-2-yogurt-granola.jpg",
      "Greek yogurt bowl with granola and fruit",
      "Unsplash",
    ),
    externalImage(
      "https://source.unsplash.com/1200x900/?granola,yogurt",
      "https://unsplash.com/s/photos/granola-yogurt",
      "mock-main-friday-2-granola.jpg",
      "Granola and yogurt snack bowl",
      "Unsplash Source",
    ),
  ],
  "mock-main-friday-3": [
    externalImage(
      "https://source.unsplash.com/1200x900/?chicken-sausage,snack",
      "https://unsplash.com/s/photos/chicken-sausage",
      "mock-main-friday-3-chicken-sausage.jpg",
      "Chicken sausage snack on a plate",
      "Unsplash Source",
    ),
  ],
  "mock-main-saturday-1": [
    externalImage(
      "https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&w=1200&q=80",
      "https://unsplash.com/photos/bananas-1528825871115-3581a5387919",
      "mock-main-saturday-1-bananas.jpg",
      "Ripe bananas on a light background",
      "Unsplash",
    ),
    externalImage(
      "https://source.unsplash.com/1200x900/?soy-milk",
      "https://unsplash.com/s/photos/soy-milk",
      "mock-main-saturday-1-soy-milk.jpg",
      "Soy milk in a glass",
      "Unsplash Source",
    ),
  ],
  "mock-main-saturday-2": [
    commonsImage("Potato-Chips.jpg", "Potato chips piled in a bowl"),
    externalImage(
      "https://source.unsplash.com/1200x900/?potato-chips,snack",
      "https://unsplash.com/s/photos/potato-chips",
      "mock-main-saturday-2-potato-chips.jpg",
      "Kettle cooked potato chips",
      "Unsplash Source",
    ),
  ],
  "mock-main-saturday-3": [
    commonsImage("Gimbap_(pixabay).jpg", "Sliced Korean gimbap rolls"),
  ],
  "mock-precedent-01": [
    commonsImage("Potato-Chips.jpg", "Potato chips piled in a bowl"),
  ],
  "mock-precedent-02": [
    externalImage(
      "https://source.unsplash.com/1200x900/?protein-shake,smoothie",
      "https://unsplash.com/s/photos/protein-shake-smoothie",
      "mock-precedent-02-protein-shake.jpg",
      "Protein shake in a cup",
      "Unsplash Source",
    ),
  ],
  "mock-precedent-03": [
    externalImage(
      "https://source.unsplash.com/1200x900/?chocolate-milk",
      "https://unsplash.com/s/photos/chocolate-milk",
      "mock-precedent-03-chocolate-milk.jpg",
      "Chocolate milk in a cup",
      "Unsplash Source",
    ),
  ],
  "mock-precedent-04": [
    commonsImage("Bungeo-ppang.jpg", "Fish-shaped Korean bungeoppang pastry"),
    commonsImage(
      "Bungeo-ppang_being_sold_in_Toronto,_Canada.jpg",
      "Bungeoppang pastries at a street stall",
    ),
  ],
  "mock-precedent-05": [
    externalImage(
      "https://source.unsplash.com/1200x900/?triangle-kimbap,onigiri",
      "https://unsplash.com/s/photos/onigiri",
      "mock-precedent-05-triangle-kimbap.jpg",
      "Triangle rice snack wrapped in seaweed",
      "Unsplash Source",
    ),
  ],
  "mock-precedent-06": [
    externalImage(
      "https://source.unsplash.com/1200x900/?almonds",
      "https://unsplash.com/s/photos/almonds",
      "mock-precedent-06-almonds.jpg",
      "A handful of almonds",
      "Unsplash Source",
    ),
  ],
  "mock-precedent-07": [
    externalImage(
      "https://source.unsplash.com/1200x900/?gummy-candy",
      "https://unsplash.com/s/photos/gummy-candy",
      "mock-precedent-07-gummy-candy.jpg",
      "Colorful gummy candies in a market tray",
      "Unsplash Source",
    ),
  ],
  "mock-precedent-08": [
    externalImage(
      "https://source.unsplash.com/1200x900/?boiled-eggs",
      "https://unsplash.com/s/photos/boiled-eggs",
      "mock-precedent-08-boiled-eggs.jpg",
      "Boiled eggs cut open on a plate",
      "Unsplash Source",
    ),
    externalImage(
      "https://source.unsplash.com/1200x900/?sparkling-water,bottle",
      "https://unsplash.com/s/photos/sparkling-water-bottle",
      "mock-precedent-08-sparkling-water.jpg",
      "Sparkling water bottle on a table",
      "Unsplash Source",
    ),
  ],
  "mock-precedent-09": [
    commonsImage("Eomuk-bar.jpg", "Korean eomuk fishcake bar on a stick"),
  ],
  "mock-precedent-10": [
    commonsImage("Hoshi-imo.jpg", "Dried sweet potato strips"),
    commonsImage("Bag_of_hoshi-imo.jpg", "Packaged dried sweet potato snack"),
  ],
};

const votePattern: VoteType[] = [
  "INNOCENT",
  "PROBATION",
  "GUILTY_BUT_UNDERSTANDABLE",
  "NOT_GUILTY_BY_CONTEXT",
  "NEEDS_MORE_EXCUSE",
];

const aiVerdictByVote: Record<VoteType, AiVerdict> = {
  INNOCENT: "INNOCENT",
  PROBATION: "PROBATION",
  GUILTY_BUT_UNDERSTANDABLE: "GUILTY_BUT_UNDERSTANDABLE",
  NOT_GUILTY_BY_CONTEXT: "INNOCENT",
  NEEDS_MORE_EXCUSE: "NEEDS_MORE_CONTEXT",
};

async function main() {
  const dateTargets = buildDateTargets();
  const allPostDrafts = [
    ...mainPostDrafts.map((post) => ({
      ...post,
      createdAt: atKst(dateTargets[post.dateKey], post.time),
    })),
    ...precedentPostDrafts.map(
      ([id, snackName, reason, authorId, tags, imageCount, verdict, dayOffset, time]) => {
        const tagList = [...tags] as string[];

        return {
          id,
          snackName,
          reason,
          authorId,
          tags: tagList,
          imageCount,
          verdict,
          ateLunch: !tagList.includes("저녁패스"),
          ateDinner: !tagList.includes("야식재판") && !tagList.includes("저녁패스"),
          createdAt: atKst(addDays(dateTargets.today, dayOffset), time),
        };
      },
    ),
  ];
  const mockPostIds = allPostDrafts.map((post) => post.id);

  await prisma.$transaction(async (tx) => {
    await tx.aiJudgement.deleteMany({ where: { postId: { in: mockPostIds } } });
    await tx.commentLike.deleteMany({
      where: {
        OR: [
          { comment: { postId: { in: mockPostIds } } },
          { userId: { in: mockUserIds } },
        ],
      },
    });
    await tx.comment.deleteMany({
      where: {
        OR: [{ postId: { in: mockPostIds } }, { id: { startsWith: "mock-comment-" } }],
      },
    });
    await tx.vote.deleteMany({
      where: {
        OR: [{ postId: { in: mockPostIds } }, { id: { startsWith: "mock-vote-" } }],
      },
    });
    await tx.postMealContext.deleteMany({ where: { postId: { in: mockPostIds } } });
    await tx.postImage.deleteMany({ where: { postId: { in: mockPostIds } } });
    await tx.postTag.deleteMany({ where: { postId: { in: mockPostIds } } });
    await tx.post.deleteMany({ where: { id: { in: mockPostIds } } });
    await tx.notificationEvent.deleteMany({ where: { userId: { in: mockUserIds } } });
    await tx.session.deleteMany({ where: { userId: { in: mockUserIds } } });
    await tx.account.deleteMany({ where: { userId: { in: mockUserIds } } });
    await tx.user.deleteMany({
      where: {
        OR: [{ id: { in: mockUserIds } }, { email: { in: mockUserEmails } }],
      },
    });

    await tx.user.createMany({ data: mockUsers });

    for (const tagName of mockTags) {
      await tx.tag.upsert({
        where: { name: tagName },
        create: { name: tagName },
        update: {},
      });
    }

    await tx.mealMenu.deleteMany({
      where: {
        id: {
          startsWith: "mock-meal-",
        },
        sourcePostId: null,
      },
    });

    for (const post of allPostDrafts) {
      const images = mockImageSourcesByPostId[post.id] ?? buildFallbackMockImages(post);

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
          createdAt: post.createdAt,
          updatedAt: post.createdAt,
          images: {
            create: images.map((image, index) => ({
              url: image.url,
              filename: image.filename,
              contentType: image.contentType,
              size: image.size,
              sortOrder: index,
              storageType: "EXTERNAL",
              sourceUrl: image.sourceUrl,
              altText: image.altText,
              width: image.width,
              height: image.height,
              metadata: image.metadata,
              createdAt: post.createdAt,
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

      if ("meal" in post && post.meal) {
        const mealDate = kstDateOnly(post.createdAt);
        const mealType = post.meal === "lunch" ? "LUNCH" : "DINNER";
        const meal = await tx.mealMenu.findUnique({
          where: {
            mealDate_mealType: {
              mealDate,
              mealType,
            },
          },
        });

        if (!meal) {
          continue;
        }

        await tx.postMealContext.create({
          data: {
            id: `mock-meal-context-${post.id}`,
            postId: post.id,
            lunchMenuId: mealType === "LUNCH" ? meal.id : null,
            dinnerMenuId: mealType === "DINNER" ? meal.id : null,
            ateLunch: post.ateLunch,
            ateDinner: post.ateDinner,
            mealNote: "실제 식단 캐시에 연결된 목업 포스트입니다.",
            createdAt: post.createdAt,
            updatedAt: post.createdAt,
          },
        });
      }
    }

    const comments = buildComments(allPostDrafts);
    await tx.comment.createMany({ data: comments });
    await tx.commentLike.createMany({
      data: buildCommentLikes(comments),
      skipDuplicates: true,
    });
    await tx.vote.createMany({
      data: buildVotes(allPostDrafts),
      skipDuplicates: true,
    });

    for (const post of allPostDrafts) {
      const verdict = aiVerdictByVote[post.verdict as VoteType] ?? "PROBATION";
      await tx.aiJudgement.create({
        data: {
          id: `mock-ai-${post.id}`,
          postId: post.id,
          modelName: "mock-gpt-5.5",
          promptVersion: "mock-snack-judge-v2",
          verdict,
          summary: `${post.snackName} 사건은 ${post.tags.join(", ")} 맥락을 고려해 ${mockVerdictLabel(post.verdict as VoteType)} 쪽으로 기웁니다.`,
          reasoning: `작성 사유와 식사 여부, 유사 판례의 분위기를 보면 "${post.reason}"이라는 주장은 일정 부분 설득력이 있습니다.`,
          rawJson: {
            verdict,
            title: `${post.snackName} 목업 판결문`,
            summary: `${post.snackName} 사건은 ${mockVerdictLabel(post.verdict as VoteType)} 의견입니다.`,
            reasoning: `목업 데이터입니다. 태그 ${post.tags.join(", ")}와 식사 여부를 판결 맥락으로 사용합니다.`,
            recommendation: "다음 사건에도 식사 여부와 간식 사유를 함께 제출하십시오.",
            confidence: 0.7,
            mock: true,
          },
          createdAt: new Date(post.createdAt.getTime() + 4 * 60_000),
        },
      });
    }
  });

  console.log(
    `Mock posts seeded: ${mainPostDrafts.length} main posts, ${precedentPostDrafts.length} precedent posts.`,
  );
  console.log(`Today: ${formatKstDate(dateTargets.today)}, Friday: ${formatKstDate(dateTargets.friday)}, Saturday: ${formatKstDate(dateTargets.saturday)}`);
}

function buildComments(posts: Array<{ id: string; createdAt: Date; snackName: string }>) {
  return posts.flatMap((post, postIndex) =>
    [
      ["mock-user-protein-lawyer", `${post.snackName}이면 증거 능력이 꽤 좋습니다.`, 0],
      ["mock-user-night-prosecutor", "다만 양과 시간이 쟁점입니다.", 2],
      ["mock-user-stack-judge", "식사 여부가 명확해서 판결이 쉬워졌습니다.", 4],
    ].map(([authorId, content, offset], commentIndex) => ({
      id: `mock-comment-${post.id}-${commentIndex + 1}`,
      postId: post.id,
      authorId: authorId as string,
      content: content as string,
      status: "PUBLISHED" as const,
      createdAt: new Date(post.createdAt.getTime() + (8 + Number(offset) + postIndex) * 60_000),
      updatedAt: new Date(post.createdAt.getTime() + (8 + Number(offset) + postIndex) * 60_000),
    })),
  );
}

function commonsImage(fileName: string, altText: string): MockImageDraft {
  const encoded = encodeURIComponent(fileName).replace(/%20/g, "_");

  return {
    url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=1200`,
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${encoded}`,
    filename: fileName,
    contentType: contentTypeFromFileName(fileName),
    size: 0,
    sortOrder: 0,
    altText,
    width: 1200,
    height: 900,
    metadata: {
      provider: "Wikimedia Commons",
      sourceName: fileName,
      licenseNote: "See sourceUrl for the exact file license and attribution.",
    },
  };
}

function externalImage(
  url: string,
  sourceUrl: string,
  filename: string,
  altText: string,
  provider: string,
): MockImageDraft {
  return {
    url,
    sourceUrl,
    filename,
    contentType: contentTypeFromFileName(filename),
    size: 0,
    sortOrder: 0,
    altText,
    width: 1200,
    height: 900,
    metadata: {
      provider,
      sourceName: sourceUrl,
      licenseNote: "Seed-only external reference image. Verify source terms before production use.",
    },
  };
}

function buildFallbackMockImages(post: { id: string; imageCount: number }) {
  return Array.from({ length: post.imageCount }, (_, index) =>
    externalImage(
      `https://picsum.photos/seed/${post.id}-${index + 1}/960/720`,
      "https://picsum.photos",
      `${post.id}-${index + 1}.jpg`,
      "Fallback placeholder snack image",
      "Picsum",
    ),
  ).map((image, index) => ({
    ...image,
    sortOrder: index,
  }));
}

function contentTypeFromFileName(fileName: string) {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".png")) {
    return "image/png";
  }

  if (lowerName.endsWith(".webp")) {
    return "image/webp";
  }

  return "image/jpeg";
}

function buildCommentLikes(comments: ReturnType<typeof buildComments>) {
  return comments.flatMap((comment, index) => {
    const likeCount = index % 3 === 0 ? 4 : index % 3 === 1 ? 2 : 1;
    return mockUserIds
      .filter((userId) => userId !== comment.authorId)
      .slice(0, likeCount)
      .map((userId) => ({
        commentId: comment.id,
        userId,
        createdAt: new Date(comment.createdAt.getTime() + 2 * 60_000),
      }));
  });
}

function buildVotes(posts: Array<{ id: string; verdict: string; createdAt: Date }>) {
  return posts.flatMap((post, postIndex) => {
    const preferred = post.verdict as VoteType;
    const rotated = [preferred, ...votePattern.filter((vote) => vote !== preferred)];

    return mockUserIds.slice(0, 5).map((userId, userIndex) => ({
      id: `mock-vote-${post.id}-${userIndex + 1}`,
      postId: post.id,
      userId,
      type: rotated[(userIndex + postIndex) % rotated.length],
      createdAt: new Date(post.createdAt.getTime() + (12 + userIndex) * 60_000),
      updatedAt: new Date(post.createdAt.getTime() + (12 + userIndex) * 60_000),
    }));
  });
}

function buildDateTargets() {
  const today = kstDateOnly(new Date());
  return {
    today,
    friday: nextKstWeekday(today, 5),
    saturday: nextKstWeekday(today, 6),
  };
}

function nextKstWeekday(baseDate: Date, targetWeekday: number) {
  const currentWeekday = Number(
    new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: "Asia/Seoul",
    })
      .format(baseDate)
      .replace("Sun", "0")
      .replace("Mon", "1")
      .replace("Tue", "2")
      .replace("Wed", "3")
      .replace("Thu", "4")
      .replace("Fri", "5")
      .replace("Sat", "6"),
  );
  const diff = (targetWeekday - currentWeekday + 7) % 7;
  return addDays(baseDate, diff);
}

function atKst(date: Date, hhmm: string) {
  const [hour, minute] = hhmm.split(":").map(Number);
  const [year, month, day] = formatKstDate(date).split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function kstDateOnly(date: Date) {
  const [year, month, day] = formatKstDate(date).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0));
}

function formatKstDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).formatToParts(date);

  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}

function mockVerdictLabel(type: VoteType) {
  return {
    INNOCENT: "무죄",
    PROBATION: "집행유예",
    GUILTY_BUT_UNDERSTANDABLE: "유죄지만 정상참작",
    NOT_GUILTY_BY_CONTEXT: "정황상 무죄",
    NEEDS_MORE_EXCUSE: "변명 보강 필요",
  }[type];
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
