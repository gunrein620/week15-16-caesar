import process from "node:process";
import { prisma } from "@junglebob/db";
import { requireMaintenanceConfirmation } from "./maintenance-guard.ts";

// 루트 .env 자동 로드 (DATABASE_URL 주입)
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // 이미 환경변수가 주입돼 있거나 .env가 없으면 무시
}

// 모든 사용자 계정과 세션을 삭제한다.
// User의 모든 관계가 onDelete: Cascade 라서 user 삭제 시
// Session, FoodPreference, Review(→ReviewTag/ReviewChunk/Comment), AgentRun(→AgentStep)까지 연쇄 삭제된다.
// MenuArchive와 McpCallLog는 사용자와 무관하므로 유지된다.
try {
  requireMaintenanceConfirmation(process.argv, "reset-auth");

  const [users, sessions, reviews, comments, prefs, agentRuns] = await Promise.all([
    prisma.user.count(),
    prisma.session.count(),
    prisma.review.count(),
    prisma.comment.count(),
    prisma.foodPreference.count(),
    prisma.agentRun.count()
  ]);

  console.log("삭제 전 현황:");
  console.log(`  User: ${users}, Session: ${sessions}, Review: ${reviews}, Comment: ${comments}, FoodPreference: ${prefs}, AgentRun: ${agentRuns}`);

  const result = await prisma.user.deleteMany({});

  const remainingSessions = await prisma.session.count();
  console.log(`\n삭제 완료: User ${result.count}명 (연쇄 삭제 포함)`);
  console.log(`남은 Session: ${remainingSessions} (0이어야 정상)`);
  console.log("MenuArchive/식단 데이터는 유지됩니다.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
