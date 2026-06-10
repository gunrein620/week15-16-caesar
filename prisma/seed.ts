import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

if (existsSync('.env')) {
  loadEnvFile('.env');
}

const prisma = new PrismaClient();

const regions = [
  { code: 'GYEONGGI', name: '경기도', level: 1, parentCode: null, latitude: 37.4138, longitude: 127.5183 },
  { code: 'OSAN', name: '오산시', level: 2, parentCode: 'GYEONGGI', latitude: 37.1498, longitude: 127.0772 },
  { code: 'OSAN_DONG', name: '오산동', level: 3, parentCode: 'OSAN', latitude: 37.1498, longitude: 127.0772 },
  { code: 'WON_DONG', name: '원동', level: 3, parentCode: 'OSAN', latitude: 37.1379, longitude: 127.0714 },
  { code: 'GWOL_DONG', name: '궐동', level: 3, parentCode: 'OSAN', latitude: 37.1596, longitude: 127.0601 },
  { code: 'GEUMAM_DONG', name: '금암동', level: 3, parentCode: 'OSAN', latitude: 37.1711, longitude: 127.0483 },
  { code: 'SEGYO_DONG', name: '세교동', level: 3, parentCode: 'OSAN', latitude: 37.1773, longitude: 127.0436 },
  { code: 'BUSAN_DONG', name: '부산동', level: 3, parentCode: 'OSAN', latitude: 37.1436, longitude: 127.0915 },
  { code: 'EUNGYE_DONG', name: '은계동', level: 3, parentCode: 'OSAN', latitude: 37.1568, longitude: 127.0727 }
] as const;

const categories = [
  { name: '동네생활', slug: 'life' },
  { name: '맛집', slug: 'food' },
  { name: '분실물', slug: 'lost-found' },
  { name: '중고거래', slug: 'market' },
  { name: '동네행사', slug: 'event' },
  { name: '생활민원', slug: 'complaint' },
  { name: '병원/약국', slug: 'medical' },
  { name: '반려동물/육아', slug: 'family-pet' }
] as const;

const demoPosts = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    title: '오산 야간 약국 정보 모아봐요',
    content:
      '밤에 아이가 열이 나거나 갑자기 약이 필요할 때 참고할 수 있도록 오산역과 원동 주변 야간 약국 정보를 댓글로 모아두면 좋겠습니다.',
    categorySlug: 'medical',
    regionCode: 'OSAN',
    tagNames: ['야간약국', '생활정보', '오산역']
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    title: '오산역 근처 분실물 안내',
    content:
      '오늘 오전 오산역 2번 출구 근처에서 검은색 카드지갑을 주웠습니다. 분실하신 분은 카드사 이름과 안에 있던 특징을 알려주세요.',
    categorySlug: 'lost-found',
    regionCode: 'OSAN',
    tagNames: ['분실물', '오산역', '카드지갑']
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    title: '이번 주말 세교동 플리마켓 열리나요?',
    content:
      '세교동 공원 쪽에서 주말 플리마켓을 준비한다는 이야기를 들었습니다. 날씨가 괜찮으면 아이들과 같이 가보려고 합니다.',
    categorySlug: 'event',
    regionCode: 'OSAN',
    tagNames: ['플리마켓', '세교동', '주말행사']
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    title: '불법 주차 생활 민원 공유합니다',
    content:
      '오산역 뒤쪽 골목에 불법 주차가 계속돼서 아침마다 차량 통행이 어렵습니다. 사진과 시간대를 모아서 민원 넣으면 좋겠습니다.',
    categorySlug: 'complaint',
    regionCode: 'OSAN',
    tagNames: ['생활민원', '불법주차', '오산역']
  },
  {
    id: '10000000-0000-4000-8000-000000000005',
    title: '오산 맛집 추천받아요',
    content:
      '주말에 가족이랑 갈 만한 오산 맛집을 찾고 있습니다. 아이랑 가기 좋은 곳이나 주차 편한 식당이면 더 좋습니다.',
    categorySlug: 'food',
    regionCode: 'OSAN',
    tagNames: ['맛집', '가족식사', '주차']
  }
] as const;

async function seedRegions() {
  const regionByCode = new Map<string, { id: string }>();

  for (const region of regions) {
    const parent = region.parentCode ? regionByCode.get(region.parentCode) : null;
    const saved = await prisma.region.upsert({
      where: { code: region.code },
      update: {
        name: region.name,
        level: region.level,
        parentId: parent?.id,
        latitude: region.latitude,
        longitude: region.longitude
      },
      create: {
        code: region.code,
        name: region.name,
        level: region.level,
        parentId: parent?.id,
        latitude: region.latitude,
        longitude: region.longitude
      },
      select: { id: true }
    });
    regionByCode.set(region.code, saved);
  }
}

async function seedCategories() {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name },
      create: category
    });
  }
}

async function seedNotice() {
  const osan = await prisma.region.findUniqueOrThrow({
    where: { code: 'OSAN' },
    select: { id: true }
  });

  await prisma.notice.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {
      title: '오산 생활 커뮤니티 이용 안내',
      content:
        'LocalMind Board는 오산 주민이 동네 생활정보를 공유하는 커뮤니티입니다. 게시글과 댓글은 향후 RAG 검색의 지역 지식으로 활용됩니다.',
      regionId: osan.id
    },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      title: '오산 생활 커뮤니티 이용 안내',
      content:
        'LocalMind Board는 오산 주민이 동네 생활정보를 공유하는 커뮤니티입니다. 게시글과 댓글은 향후 RAG 검색의 지역 지식으로 활용됩니다.',
      regionId: osan.id
    }
  });
}

async function seedDemoUser() {
  const osan = await prisma.region.findUniqueOrThrow({
    where: { code: 'OSAN' },
    select: { id: true }
  });
  const passwordHash = await hash('password123', 10);

  return prisma.user.upsert({
    where: { email: 'demo@localmind.dev' },
    update: {
      nickname: '오산데모',
      passwordHash,
      defaultRegionId: osan.id
    },
    create: {
      email: 'demo@localmind.dev',
      nickname: '오산데모',
      passwordHash,
      defaultRegionId: osan.id
    },
    select: { id: true }
  });
}

async function seedDemoPosts() {
  const author = await seedDemoUser();

  for (const demoPost of demoPosts) {
    const [category, region] = await Promise.all([
      prisma.category.findUniqueOrThrow({
        where: { slug: demoPost.categorySlug },
        select: { id: true }
      }),
      prisma.region.findUniqueOrThrow({
        where: { code: demoPost.regionCode },
        select: { id: true }
      })
    ]);

    await prisma.post.upsert({
      where: { id: demoPost.id },
      update: {
        title: demoPost.title,
        content: demoPost.content,
        authorId: author.id,
        categoryId: category.id,
        regionId: region.id,
        status: 'PUBLISHED'
      },
      create: {
        id: demoPost.id,
        title: demoPost.title,
        content: demoPost.content,
        authorId: author.id,
        categoryId: category.id,
        regionId: region.id,
        status: 'PUBLISHED'
      }
    });

    await prisma.postTag.deleteMany({
      where: { postId: demoPost.id }
    });

    for (const tagName of demoPost.tagNames) {
      const tag = await prisma.tag.upsert({
        where: { name: tagName },
        update: {},
        create: { name: tagName },
        select: { id: true }
      });
      await prisma.postTag.create({
        data: {
          postId: demoPost.id,
          tagId: tag.id
        }
      });
    }
  }
}

async function seedDemoEmbeddings() {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY is not set. Demo embeddings were skipped.');
    return;
  }

  const posts = await prisma.post.findMany({
    where: {
      id: {
        in: demoPosts.map((post) => post.id)
      }
    },
    include: {
      category: true,
      region: true,
      tags: {
        include: {
          tag: true
        }
      }
    }
  });
  for (const post of posts) {
    const content = [
      '[게시글]',
      `제목: ${post.title}`,
      `지역: ${post.region.name}`,
      `카테고리: ${post.category.name}`,
      `태그: ${post.tags.map((postTag) => postTag.tag.name).join(', ')}`,
      `내용: ${post.content}`
    ].join('\n');
    await upsertEmbedding('POST', post.id, post.regionId, content);
  }

  const notices = await prisma.notice.findMany();
  for (const notice of notices) {
    const content = ['[공지]', `제목: ${notice.title}`, `내용: ${notice.content}`].join('\n');
    await upsertEmbedding('NOTICE', notice.id, notice.regionId, content);
  }
}

async function upsertEmbedding(
  sourceType: 'POST' | 'NOTICE',
  sourceId: string,
  regionId: string | null,
  content: string
) {
  const embedding = await createEmbedding(content);
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "embeddings" ("id", "sourceType", "sourceId", "regionId", content, embedding)
    VALUES ($1, $2::"EmbeddingSourceType", $3, $4, $5, $6::vector)
    ON CONFLICT ("sourceType", "sourceId") DO UPDATE
    SET "regionId" = EXCLUDED."regionId",
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        "createdAt" = now()
    `,
    randomUUID(),
    sourceType,
    sourceId,
    regionId,
    content,
    formatVector(embedding)
  );
}

async function createEmbedding(input: string) {
  const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const model = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small';
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/embeddings`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input
    })
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
  const embedding = data.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error('Embedding response did not include a vector.');
  }

  const expected = Number(process.env.EMBEDDING_DIM ?? 1536);
  if (embedding.length !== expected) {
    throw new Error(`Embedding dimension mismatch: expected ${expected}, got ${embedding.length}`);
  }
  return embedding;
}

function formatVector(embedding: number[]) {
  if (!embedding.every((value) => Number.isFinite(value))) {
    throw new Error('Embedding vector contains a non-finite value.');
  }
  return `[${embedding.join(',')}]`;
}

async function main() {
  await seedRegions();
  await seedCategories();
  await seedNotice();
  await seedDemoPosts();
  await seedDemoEmbeddings();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
