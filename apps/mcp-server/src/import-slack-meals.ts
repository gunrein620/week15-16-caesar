import process from "node:process";
import { prisma } from "@junglebob/db";
import { importSlackMealCandidatesToMenuArchive } from "./slack-meal-importer.ts";

// 레포 루트 .env 자동 로드 (DATABASE_URL 등 주입)
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // 이미 환경변수가 주입돼 있거나 .env가 없으면 무시
}

try {
  const result = await importSlackMealCandidatesToMenuArchive();
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
