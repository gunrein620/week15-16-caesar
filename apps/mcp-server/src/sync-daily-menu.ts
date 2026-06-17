import process from "node:process";
import { prisma } from "@junglebob/db";
import { runLoggedMcpTool, type McpToolLogStore } from "./tools.ts";

// 레포 루트 .env를 자동 로드한다(어느 디렉터리에서 실행하든 키가 주입되도록).
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // .env가 없거나 이미 환경변수로 주입된 경우는 무시한다.
}

// 매일 카카오 일별 식단 이미지를 가져와 MenuArchive에 저장하는 자동 실행용 스크립트.
// 도구가 현재 시각(KST)으로 끼니를 판별한다: 11:00~13:30 -> 점심, 17:00~19:30 -> 저녁, 일요일 제외.
// 따라서 점심/저녁 창 안에서 실행하면 해당 끼니를 동기화하고, 창 밖이면 아무 것도 하지 않는다.
// 실제 동작에는 .env의 KAKAO_CHANNEL_PROFILE_ID 등 카카오 설정이 필요하다.

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

// --force 옵션을 주면 점심/저녁 창 밖이어도 두 끼 모두 강제로 수집한다(테스트용).
const force = process.argv.includes("--force");

try {
  const result = await runLoggedMcpTool("sync_daily_menu_image", force ? { force: true } : {}, { logStore });
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
