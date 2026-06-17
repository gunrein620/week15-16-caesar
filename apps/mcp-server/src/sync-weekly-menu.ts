import process from "node:process";
import { prisma } from "@junglebob/db";
import { runLoggedMcpTool, type McpToolLogStore } from "./tools.ts";

// 레포 루트 .env를 자동 로드한다(어느 디렉터리에서 실행하든 키가 주입되도록).
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // .env가 없거나 이미 환경변수로 주입된 경우는 무시한다.
}

// 매주 카카오 주간 식단표 이미지를 OCR해 MenuArchive(월~토 점심/저녁)에 저장하는 자동 실행용 스크립트.
// 실제 동작에는 .env의 OPENAI_API_KEY와 KAKAO_WEEKLY_MENU_POST_URL(또는 KAKAO_WEEKLY_MENU_IMAGE_URL)이 필요하다.
// 키/URL이 없으면 throw 없이 { ok: false, status: "unavailable" } 결과를 출력한다.

const logStore: McpToolLogStore = {
  async create(input) {
    return prisma.mcpCallLog.create({
      data: {
        toolName: input.toolName,
        input: jsonValue(input.input)
      },
      select: { id: true }
    });
  },
  async update(id, data) {
    await prisma.mcpCallLog.update({
      where: { id },
      data: {
        status: data.status,
        output: data.output === undefined ? undefined : jsonValue(data.output),
        error: data.error
      }
    });
  }
};

try {
  const result = await runLoggedMcpTool("sync_weekly_menu", {}, { logStore });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null));
}
