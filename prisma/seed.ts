// 디자인 와이어프레임의 placeholder 데이터를 그대로 시드한다.
// 데모 계정(demo@jungle.market)은 게스트 로그인이 사용하는 계정 — 채팅방이 이 계정 기준으로 보인다.
import { PrismaClient, ProductStatus } from "@prisma/client";

const prisma = new PrismaClient();

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
const hoursAgo = (n: number) => minutesAgo(n * 60);
const daysAgo = (n: number) => hoursAgo(n * 24);

const CATEGORIES = [
  "디지털·가전",
  "가구·인테리어",
  "의류·잡화",
  "생활·주방",
  "유아·완구",
  "스포츠·레저",
  "취미·게임",
  "나눔·무료",
];

const TAGS = ["동네질문", "동네소식", "맛집", "나눔", "모임", "분실/실종"];

async function main() {
  // 멱등 시드: 전부 지우고 다시 만든다 (개발용)
  await prisma.message.deleteMany();
  await prisma.chatRoom.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();
  await prisma.postTag.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  // ── 사용자 ──
  const [demo, gunu, friend, chorok, runner] = await Promise.all([
    prisma.user.create({
      data: {
        email: "demo@jungle.market",
        name: "정글러",
        nickname: "정글러",
        town: "역삼동",
        mannerTemp: 37.8,
        isGuest: true,
      },
    }),
    prisma.user.create({
      data: { email: "gunu@jungle.market", name: "거누땅", nickname: "거누땅", town: "역삼동", mannerTemp: 42.5 },
    }),
    prisma.user.create({
      data: { email: "friend@jungle.market", name: "동네친구", nickname: "동네친구", town: "논현동", mannerTemp: 39.2 },
    }),
    prisma.user.create({
      data: { email: "chorok@jungle.market", name: "초록맘", nickname: "초록맘", town: "대치동", mannerTemp: 41.0 },
    }),
    prisma.user.create({
      data: { email: "runner@jungle.market", name: "러닝크루", nickname: "러닝크루", town: "도곡동", mannerTemp: 38.4 },
    }),
  ]);

  // ── 카테고리 ──
  const cats: Record<string, number> = {};
  for (const [i, name] of CATEGORIES.entries()) {
    const c = await prisma.category.create({ data: { name, order: i } });
    cats[name] = c.id;
  }

  // ── 상품 (홈 피드 8건 — 와이어프레임 ITEMS) ──
  const iphone = await prisma.product.create({
    data: {
      title: "아이폰 13 미니 128GB 미드나이트",
      description:
        "1년 사용한 미니 13입니다. 액정·배터리 성능 89%, 케이스 끼워 써서 흠집 거의 없어요. 직거래는 역삼역 1번 출구에서 가능합니다.",
      price: 420_000,
      status: ProductStatus.RESERVED,
      location: "역삼동",
      meetPlace: "역삼역 1번 출구",
      viewCount: 128,
      sellerId: gunu.id,
      categoryId: cats["디지털·가전"],
      createdAt: minutesAgo(3),
    },
  });

  const shelf = await prisma.product.create({
    data: {
      title: "무인양품 4단 우드 선반",
      description: "이사하면서 내놓아요. 사용감 적고 흔들림 없어요. 직접 가져가실 분이면 좋아요.",
      price: 25_000,
      location: "논현동",
      sellerId: demo.id,
      categoryId: cats["가구·인테리어"],
      createdAt: minutesAgo(12),
    },
  });

  await prisma.product.create({
    data: {
      title: "닌텐도 스위치 OLED",
      description: "풀박스, 작동 문제 없어요. 조이콘 쏠림 없습니다.",
      price: 280_000,
      location: "삼성동",
      viewCount: 96,
      sellerId: friend.id,
      categoryId: cats["취미·게임"],
      createdAt: hoursAgo(1),
    },
  });

  const chair = await prisma.product.create({
    data: {
      title: "코스트코 캠핑 의자",
      description: "두 개 중 하나 나눔해요. 상태 깨끗합니다. 먼저 연락 주시는 분께 드려요.",
      price: 0,
      location: "대치동",
      sellerId: demo.id,
      categoryId: cats["나눔·무료"],
      createdAt: minutesAgo(1),
    },
  });

  await prisma.product.create({
    data: {
      title: "다이슨 V11 무선청소기",
      description: "배터리 교체한 지 6개월 됐어요. 흡입력 좋습니다.",
      price: 190_000,
      status: ProductStatus.DONE,
      location: "청담동",
      sellerId: chorok.id,
      categoryId: cats["생활·주방"],
      createdAt: hoursAgo(2),
    },
  });

  await prisma.product.create({
    data: {
      title: "원목 책상 1200×600",
      description: "원목 상판 책상이에요. 상판 기스 약간 있지만 튼튼해요.",
      price: 50_000,
      location: "신사동",
      sellerId: friend.id,
      categoryId: cats["가구·인테리어"],
      createdAt: daysAgo(1),
    },
  });

  await prisma.product.create({
    data: {
      title: "르크루제 20cm 냄비",
      description: "선물 받고 두 번 썼어요. 흠집 없이 깨끗합니다.",
      price: 60_000,
      location: "압구정동",
      sellerId: chorok.id,
      categoryId: cats["생활·주방"],
      createdAt: hoursAgo(3),
    },
  });

  await prisma.product.create({
    data: {
      title: "하이브리드 자전거",
      description: "출퇴근용으로 탔어요. 기어 변속 부드럽고 브레이크 패드 새로 갈았습니다.",
      price: 120_000,
      status: ProductStatus.RESERVED,
      location: "도곡동",
      sellerId: demo.id,
      categoryId: cats["스포츠·레저"],
      createdAt: minutesAgo(30),
    },
  });

  // 거누땅의 다른 물건 (상세 페이지 하단 4열)
  const others: Array<[string, number]> = [
    ["에어팟 프로 2", 180_000],
    ["맥세이프 충전기", 20_000],
    ["갤럭시 워치", 90_000],
    ["아이패드 미니", 350_000],
  ];
  for (const [i, [title, price]] of others.entries()) {
    await prisma.product.create({
      data: {
        title,
        description: "상태 좋아요. 직거래는 역삼역 근처에서 가능합니다.",
        price,
        location: "역삼동",
        sellerId: gunu.id,
        categoryId: cats["디지털·가전"],
        createdAt: daysAgo(2 + i),
      },
    });
  }

  // 거래완료 채팅용 상품 (피드 상위 8건 밖으로 밀리도록 오래된 날짜)
  const bike = await prisma.product.create({
    data: {
      title: "로드 자전거 입문용",
      description: "입문용 로드예요. 거래 완료되었습니다.",
      price: 150_000,
      status: ProductStatus.DONE,
      location: "역삼동",
      sellerId: demo.id,
      categoryId: cats["스포츠·레저"],
      createdAt: daysAgo(6),
    },
  });

  // 관심 (아이폰: 관심 14처럼 보이게 몇 개만 — 카운트는 UI에서 합산)
  await prisma.favorite.createMany({
    data: [
      { userId: demo.id, productId: iphone.id },
      { userId: friend.id, productId: iphone.id },
      { userId: chorok.id, productId: iphone.id },
      { userId: runner.id, productId: shelf.id },
    ],
  });

  // ── 채팅방 4건 (와이어프레임 ROOMS — 데모 계정 시점) ──
  const today1730 = new Date();
  today1730.setHours(17, 30, 0, 0);

  // 1) 거누땅 × 아이폰 (활성, 거래 약속 잡힘)
  const room1 = await prisma.chatRoom.create({
    data: {
      productId: iphone.id,
      buyerId: demo.id,
      sellerId: gunu.id,
      meetAt: today1730,
      meetPlace: "역삼역 1번 출구",
      createdAt: hoursAgo(1),
    },
  });
  const thread: Array<[string, string, number]> = [
    [demo.id, "안녕하세요! 아이폰 13 미니 아직 판매하나요?", 35],
    [gunu.id, "네 아직 있어요. 직거래 가능하세요?", 31],
    [demo.id, "네 좋아요. 역삼역 근처 가능할까요?", 27],
    [gunu.id, "오후 5시 30분에 역삼역 1번 출구 어떠세요?", 12],
    [demo.id, "네 그 시간에 역삼역에서 봬요!", 6],
  ];
  for (const [senderId, body, min] of thread) {
    await prisma.message.create({
      data: { roomId: room1.id, senderId, body, createdAt: minutesAgo(min), readAt: minutesAgo(min - 1) },
    });
  }

  // 2) 동네친구 × 캠핑 의자 (안 읽은 메시지 2)
  const room2 = await prisma.chatRoom.create({
    data: { productId: chair.id, buyerId: friend.id, sellerId: demo.id, createdAt: hoursAgo(2) },
  });
  await prisma.message.create({
    data: { roomId: room2.id, senderId: friend.id, body: "안녕하세요, 캠핑 의자 보고 연락드려요!", createdAt: hoursAgo(1.4) },
  });
  await prisma.message.create({
    data: { roomId: room2.id, senderId: friend.id, body: "혹시 네고 가능할까요?", createdAt: hoursAgo(1.3) },
  });

  // 3) 초록맘 × 4단 선반
  const room3 = await prisma.chatRoom.create({
    data: { productId: shelf.id, buyerId: chorok.id, sellerId: demo.id, createdAt: hoursAgo(7) },
  });
  await prisma.message.create({
    data: {
      roomId: room3.id,
      senderId: chorok.id,
      body: "사진 한 장만 더 보여주세요",
      createdAt: hoursAgo(7),
      readAt: hoursAgo(6.9),
    },
  });

  // 4) 러닝크루 × 자전거 (거래완료)
  const room4 = await prisma.chatRoom.create({
    data: { productId: bike.id, buyerId: runner.id, sellerId: demo.id, createdAt: daysAgo(1.2) },
  });
  await prisma.message.create({
    data: {
      roomId: room4.id,
      senderId: runner.id,
      body: "거래 완료 감사합니다 :)",
      createdAt: daysAgo(1),
      readAt: daysAgo(0.9),
    },
  });

  // ── 게시판 (동네 생활) ──
  const tagIds: Record<string, number> = {};
  for (const name of TAGS) {
    const t = await prisma.tag.create({ data: { name } });
    tagIds[name] = t.id;
  }

  const posts: Array<{
    title: string;
    content: string;
    author: string;
    tags: string[];
    hoursAgo: number;
    comments?: Array<[string, string]>;
  }> = [
    {
      title: "역삼역 근처 자전거 수리점 추천해 주세요",
      content: "체인이 자꾸 빠지는데 가까운 수리점 아시는 분 계신가요? 주말에도 하는 곳이면 좋겠어요.",
      author: demo.id,
      tags: ["동네질문"],
      hoursAgo: 2,
      comments: [
        [gunu.id, "역삼초등학교 사거리에 한 곳 있어요. 주말 오전에도 열어요."],
        [friend.id, "저도 거기서 고쳤는데 친절하세요!"],
        [demo.id, "감사해요, 이번 주말에 가볼게요."],
      ],
    },
    {
      title: "도곡공원에서 강아지 산책 모임 하실 분",
      content: "매주 토요일 아침에 도곡공원 한 바퀴 도는 모임이에요. 소형견 위주이고 편하게 오세요.",
      author: runner.id,
      tags: ["모임"],
      hoursAgo: 5,
      comments: [[chorok.id, "푸들 데리고 가도 될까요?"]],
    },
    {
      title: "선릉로 골목에 새로 생긴 칼국수집 후기",
      content: "어제 가봤는데 면이 쫄깃하고 양도 많아요. 점심엔 줄이 기니까 조금 일찍 가세요.",
      author: chorok.id,
      tags: ["맛집", "동네소식"],
      hoursAgo: 9,
      comments: [
        [demo.id, "오 위치가 정확히 어디인가요?"],
        [chorok.id, "선릉로 73길 초입이에요. 간판이 초록색이라 바로 보여요."],
      ],
    },
    {
      title: "아이 장난감 정리해서 나눔해요",
      content: "5살까지 가지고 놀던 블록이랑 자동차 장난감 나눔합니다. 상태 깨끗해요. 채팅 주세요.",
      author: chorok.id,
      tags: ["나눔"],
      hoursAgo: 14,
    },
    {
      title: "이번 주말 역삼1동 벼룩시장 열려요",
      content: "토요일 오전 10시부터 주민센터 앞마당에서 벼룩시장 한대요. 셀러 신청도 받는다고 해요.",
      author: gunu.id,
      tags: ["동네소식"],
      hoursAgo: 20,
      comments: [[friend.id, "셀러 신청은 어디서 하나요?"]],
    },
    {
      title: "검은색 카드지갑 주우신 분 계신가요",
      content: "어제 저녁 역삼역 2번 출구 근처에서 잃어버렸어요. 보신 분 연락 부탁드려요.",
      author: friend.id,
      tags: ["분실/실종"],
      hoursAgo: 26,
    },
    {
      title: "헬스장 같이 다닐 분 구해요",
      content: "평일 저녁 7시쯤 가는데 같이 운동하면서 동기부여 받을 분 찾아요.",
      author: demo.id,
      tags: ["모임"],
      hoursAgo: 31,
    },
    {
      title: "동네 도서관 운영시간 바뀐 거 아시나요",
      content: "이번 달부터 평일 밤 10시까지로 연장됐어요. 시험 기간에 좋을 것 같아요.",
      author: gunu.id,
      tags: ["동네소식"],
      hoursAgo: 40,
    },
    {
      title: "근처에 맛있는 김밥집 어디인가요",
      content: "이사 온 지 얼마 안 됐는데 단골 김밥집을 찾고 있어요. 추천해 주세요.",
      author: runner.id,
      tags: ["동네질문", "맛집"],
      hoursAgo: 50,
      comments: [[gunu.id, "은행나무 김밥 추천해요. 참치김밥이 진짜예요."]],
    },
    {
      title: "화분 분갈이 흙 남은 거 나눔합니다",
      content: "분갈이하고 흙이 반 포대 남았어요. 필요하신 분 가져가세요.",
      author: chorok.id,
      tags: ["나눔"],
      hoursAgo: 60,
    },
    {
      title: "아파트 단지 앞 공사 언제 끝나나요",
      content: "아침마다 소음이 심한데 혹시 공사 기간 아시는 분 있나요?",
      author: friend.id,
      tags: ["동네질문"],
      hoursAgo: 75,
    },
    {
      title: "주말 아침 러닝 크루 모집해요",
      content: "일요일 아침 8시 양재천에서 가볍게 5km 뛰어요. 초보 환영입니다.",
      author: runner.id,
      tags: ["모임"],
      hoursAgo: 90,
    },
  ];

  for (const p of posts) {
    const created = await prisma.post.create({
      data: {
        title: p.title,
        content: p.content,
        authorId: p.author,
        createdAt: hoursAgo(p.hoursAgo),
        tags: { create: p.tags.map((t) => ({ tagId: tagIds[t] })) },
      },
    });
    for (const [i, [authorId, body]] of (p.comments ?? []).entries()) {
      await prisma.comment.create({
        data: { body, authorId, postId: created.id, createdAt: hoursAgo(p.hoursAgo - 0.5 - i * 0.2) },
      });
    }
  }

  console.log("Seed complete: 5 users, 13 products, 4 chat rooms, 12 posts");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
