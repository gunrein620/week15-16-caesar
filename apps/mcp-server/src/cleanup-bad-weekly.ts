import process from "node:process";
import { prisma } from "@junglebob/db";
import { requireMaintenanceConfirmation } from "./maintenance-guard.ts";

// 루트 .env 자동 로드 (DATABASE_URL 주입)
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // 이미 환경변수가 주입돼 있거나 .env가 없으면 무시
}

// OCR이 연도를 2020으로 잘못 채워 저장됐던 주간 식단 레코드를 삭제한다.
// sourceId 형식: "weekly:2020-06-08:monday:LUNCH" → "weekly:2020"으로 시작.
try {
  requireMaintenanceConfirmation(process.argv, "cleanup-bad-weekly");

  const target = await prisma.menuArchive.findMany({
    where: { sourceId: { startsWith: "weekly:2020" } },
    select: { id: true, date: true, mealType: true, sourceId: true }
  });

  console.log(`삭제 대상 ${target.length}건:`);
  for (const row of target) {
    console.log(`  - ${row.sourceId} (${new Date(row.date).toISOString().slice(0, 10)} ${row.mealType})`);
  }

  const result = await prisma.menuArchive.deleteMany({
    where: { sourceId: { startsWith: "weekly:2020" } }
  });

  console.log(`삭제 완료: ${result.count}건`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
