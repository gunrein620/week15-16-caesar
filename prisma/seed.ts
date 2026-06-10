import { PrismaClient } from '@prisma/client';

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

async function main() {
  await seedRegions();
  await seedCategories();
  await seedNotice();
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
