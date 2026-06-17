import assert from "node:assert/strict";
import test from "node:test";
import { handleRpcMethod } from "./rpc-methods.ts";

test("handleRpcMethod returns detailed tool definitions", async () => {
  const result = await handleRpcMethod("tools/list");

  assert.deepEqual(result, {
    tools: [
      {
        name: "import_slack_menu_history",
        description: "Slack 채널에서 식단 관련 메시지와 이미지를 수집한다."
      },
      {
        name: "fetch_kakao_weekly_menu_image",
        description: "카카오 채널 식단 게시글을 조회하고 식단 이미지 URL을 추출한다."
      },
      {
        name: "extract_menu_image_urls",
        description: "HTML에서 식단 이미지 후보 URL을 추출한다."
      },
      {
        name: "sync_weekly_menu",
        description: "카카오 주간 식단표 이미지 OCR 결과를 MenuArchive에 동기화한다."
      },
      {
        name: "sync_daily_menu_image",
        description: "현재 시간대에 맞는 카카오 중식/석식 게시글 이미지를 MenuArchive에 동기화한다."
      },
      {
        name: "extract_menu_from_image",
        description: "OpenAI Vision으로 식단 이미지의 OCR 텍스트를 추출한다."
      },
      {
        name: "get_food_poisoning_risk",
        description: "외부 식중독 위험도 API를 조회한다."
      }
    ]
  });
});

test("handleRpcMethod executes tools by tools/name and writes logs", async () => {
  const events: unknown[] = [];
  const result = await handleRpcMethod(
    "tools/extract_menu_image_urls",
    {
      html: '<img src="/weekly.png">',
      baseUrl: "https://pf.kakao.com/channel/posts/1"
    },
    {
      logStore: {
        async create(input) {
          events.push({ create: input });
          return { id: "log-1" };
        },
        async update(id, data) {
          events.push({ update: { id, data } });
        }
      }
    }
  );

  assert.deepEqual(result, {
    ok: true,
    imageUrls: ["https://pf.kakao.com/weekly.png"],
    imageUrl: "https://pf.kakao.com/weekly.png"
  });
  assert.equal(events.length, 2);
});

test("handleRpcMethod does not write DB logs for Slack raw meal import", async () => {
  const events: unknown[] = [];

  await assert.rejects(
    () =>
      handleRpcMethod(
        "tools/import_slack_menu_history",
        {},
        {
          logStore: {
            async create(input) {
              events.push({ create: input });
              return { id: "log-1" };
            },
            async update(id, data) {
              events.push({ update: { id, data } });
            }
          }
        }
      ),
    /SLACK_BOT_TOKEN/
  );

  assert.deepEqual(events, []);
});
