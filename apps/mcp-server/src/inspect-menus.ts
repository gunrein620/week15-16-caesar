import process from "node:process";
import { prisma } from "@junglebob/db";

// 루트 .env 자동 로드 (DATABASE_URL 주입)
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // 이미 환경변수가 주입돼 있거나 .env가 없으면 무시
}

// MenuArchive 내용을 그대로 출력하는 읽기 전용 점검 스크립트.
// 사용법: npx tsx src/inspect-menus.ts            (기본: 2026-06-08 ~ 2026-06-14)
//         npx tsx src/inspect-menus.ts 2026-06-08 2026-06-14
const fromText = process.argv[2] ?? "2026-06-08";
const toText = process.argv[3] ?? "2026-06-14";

try {
  const rows = await prisma.menuArchive.findMany({
    where: {
      date: {
        gte: new Date(`${fromText}T00:00:00.000Z`),
        lte: new Date(`${toText}T23:59:59.999Z`)
      }
    },
    orderBy: [{ date: "asc" }, { mealType: "asc" }],
    select: { date: true, mealType: true, sourceId: true, imageUrl: true, items: true }
  });

  console.log(`기간 ${fromText} ~ ${toText} / 총 ${rows.length}행\n`);
  for (const row of rows) {
    const date = new Date(row.date).toISOString().slice(0, 10);
    const hasImg = row.imageUrl ? "✅ 있음" : "❌ 없음(null)";
    console.log(`${date} ${row.mealType}`);
    console.log(`  imageUrl: ${hasImg}  ${row.imageUrl ?? ""}`);
    console.log(`  sourceId: ${row.sourceId ?? "(none)"}`);
    console.log(`  items   : ${row.items.join(", ")}`);
    console.log("");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
