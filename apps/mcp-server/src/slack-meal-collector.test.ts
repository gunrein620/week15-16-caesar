import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  collectSlackMealRaw,
  resolveSlackMealCollectorConfig,
  resolveSlackMealStorageDir,
  selectSlackMealMessages,
  type SlackMealApi
} from "./slack-meal-collector.ts";

test("resolveSlackMealCollectorConfig reads token and channel env names without exposing values", () => {
  const config = resolveSlackMealCollectorConfig({
    SLACK_BOT_TOKEN: "test-env-token",
    SLACK_CHANNEL_ID: "C123"
  });

  assert.equal(config.tokenEnvName, "SLACK_BOT_TOKEN");
  assert.equal(config.channelEnvName, "SLACK_CHANNEL_ID");
  assert.equal(config.channelId, "C123");
  assert.equal(config.token, "test-env-token");
});

test("resolveSlackMealCollectorConfig prefers SLACK_MENU_CHANNEL_ID for meal collection", () => {
  const config = resolveSlackMealCollectorConfig({
    SLACK_BOT_TOKEN: "test-env-token",
    SLACK_MENU_CHANNEL_ID: "CMEAL",
    SLACK_CHANNEL_ID: "CGENERAL"
  });

  assert.equal(config.channelEnvName, "SLACK_MENU_CHANNEL_ID");
  assert.equal(config.channelId, "CMEAL");
});

test("resolveSlackMealStorageDir resolves relative paths from the repository root", () => {
  const storageDir = resolveSlackMealStorageDir("storage/slack-meals");

  assert.match(storageDir, /[\\/]storage[\\/]slack-meals$/);
  assert.equal(storageDir.includes(`${join("apps", "mcp-server")}`), false);
});

test("resolveSlackMealCollectorConfig leaves history page count uncapped by default", () => {
  const config = resolveSlackMealCollectorConfig({
    SLACK_BOT_TOKEN: "test-env-token",
    SLACK_MENU_CHANNEL_ID: "CMEAL"
  });

  assert.equal(config.pageLimit, undefined);
});

test("resolveSlackMealCollectorConfig accepts an explicit history page cap", () => {
  const config = resolveSlackMealCollectorConfig({
    SLACK_BOT_TOKEN: "test-env-token",
    SLACK_MENU_CHANNEL_ID: "CMEAL",
    SLACK_MEAL_HISTORY_PAGE_LIMIT: "2"
  });

  assert.equal(config.pageLimit, 2);
});

test("resolveSlackMealCollectorConfig fails clearly when Slack env vars are missing", () => {
  assert.throws(
    () => resolveSlackMealCollectorConfig({ SLACK_MENU_CHANNEL_ID: "C123" }),
    /SLACK_BOT_TOKEN/
  );

  assert.throws(
    () => resolveSlackMealCollectorConfig({ SLACK_BOT_TOKEN: "test-env-token" }),
    /SLACK_MENU_CHANNEL_ID/
  );
});

test("selectSlackMealMessages keeps only likely meal messages", () => {
  const selected = selectSlackMealMessages([
    { ts: "1", text: "오늘 점심 메뉴입니다" },
    { ts: "2", text: "회의 시작합니다" },
    { ts: "3", text: "6월 2주차 식단표", files: [{ id: "F1", mimetype: "image/png" }] }
  ]);

  assert.deepEqual(
    selected.map((message) => message.ts),
    ["1", "3"]
  );
});

test("collectSlackMealRaw writes raw message JSON and downloads Slack images", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "slack-meals-"));
  const historyRequests: unknown[] = [];
  const downloadedUrls: string[] = [];
  const api: SlackMealApi = {
    async fetchHistory(request) {
      historyRequests.push(request);

      if (!request.cursor) {
        return {
          messages: [
            {
              ts: "1710000000.000100",
              text: "오늘 점심 메뉴입니다",
              user: "U123",
              files: [
                {
                  id: "FIMG1",
                  name: "lunch menu.jpg",
                  mimetype: "image/jpeg",
                  url_private_download: "https://files.slack.com/lunch.jpg"
                }
              ]
            },
            {
              ts: "1710000001.000200",
              text: "그냥 잡담",
              user: "U456"
            }
          ],
          nextCursor: "NEXT"
        };
      }

      return {
        messages: [{ ts: "1710000002.000300", text: "석식 메뉴 공유", user: "U789" }]
      };
    },
    async downloadFile(url) {
      downloadedUrls.push(url);
      return {
        body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
        contentType: "image/jpeg"
      };
    }
  };

  const result = await collectSlackMealRaw({
    api,
    channelId: "CMEAL",
    pageLimit: 3,
    storageDir,
    token: "test-env-token"
  });

  assert.equal(historyRequests.length, 2);
  assert.equal(result.messagesCollected, 2);
  assert.equal(result.imagesDownloaded, 1);
  assert.equal(result.rawFiles.length, 2);
  assert.equal(result.imageFiles.length, 1);
  assert.deepEqual(downloadedUrls, ["https://files.slack.com/lunch.jpg"]);

  const rawJson = await readFile(result.rawFiles[0], "utf8");
  assert.match(rawJson, /오늘 점심 메뉴입니다/);
  assert.match(rawJson, /FIMG1/);
  assert.doesNotMatch(rawJson, /test-env-token/);

  const imageBytes = await readFile(result.imageFiles[0]);
  assert.deepEqual([...imageBytes], [0xff, 0xd8, 0xff, 0xd9]);
});

test("collectSlackMealRaw rejects HTML responses when downloading Slack images", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "slack-meals-"));
  const api: SlackMealApi = {
    async fetchHistory() {
      return {
        messages: [
          {
            ts: "1710000000.000100",
            text: "lunch menu",
            files: [
              {
                id: "FIMG1",
                name: "lunch menu.jpg",
                mimetype: "image/jpeg",
                url_private_download: "https://files.slack.com/lunch.jpg"
              }
            ]
          }
        ]
      };
    },
    async downloadFile() {
      return {
        body: new TextEncoder().encode("<!DOCTYPE html><html></html>"),
        contentType: "text/html; charset=utf-8"
      };
    }
  };

  const result = await collectSlackMealRaw({
    api,
    channelId: "CMEAL",
    storageDir,
    token: "test-env-token"
  });

  assert.equal(result.imagesDownloaded, 0);
  assert.equal(result.imagesFailed, 1);
  assert.equal(result.imageFiles.length, 0);

  const rawJson = await readFile(result.rawFiles[0], "utf8");
  assert.match(rawJson, /"status": "failed"/);
  assert.match(rawJson, /Slack file download was not an image/);
});

test("collectSlackMealRaw rejects image content types with non-image bytes", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "slack-meals-"));
  const api: SlackMealApi = {
    async fetchHistory() {
      return {
        messages: [
          {
            ts: "1710000000.000100",
            text: "lunch menu",
            files: [
              {
                id: "FIMG1",
                name: "lunch menu.jpg",
                mimetype: "image/jpeg",
                url_private_download: "https://files.slack.com/lunch.jpg"
              }
            ]
          }
        ]
      };
    },
    async downloadFile() {
      return {
        body: new Uint8Array([1, 2, 3]),
        contentType: "image/jpeg"
      };
    }
  };

  const result = await collectSlackMealRaw({
    api,
    channelId: "CMEAL",
    storageDir,
    token: "test-env-token"
  });

  assert.equal(result.imagesDownloaded, 0);
  assert.equal(result.imagesFailed, 1);
  assert.equal(result.imageFiles.length, 0);
});

test("collectSlackMealRaw follows Slack cursors until history is exhausted when pageLimit is not set", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "slack-meals-"));
  const cursors: Array<string | undefined> = [];
  const api: SlackMealApi = {
    async fetchHistory(request) {
      cursors.push(request.cursor);

      if (!request.cursor) {
        return {
          messages: [{ ts: "1", text: "점심 메뉴" }],
          nextCursor: "PAGE2"
        };
      }

      if (request.cursor === "PAGE2") {
        return {
          messages: [{ ts: "2", text: "저녁 메뉴" }],
          nextCursor: "PAGE3"
        };
      }

      return {
        messages: [{ ts: "3", text: "식단표" }]
      };
    },
    async downloadFile() {
      throw new Error("no images should be downloaded");
    }
  };

  const result = await collectSlackMealRaw({
    api,
    channelId: "CMEAL",
    downloadImages: false,
    storageDir,
    token: "test-env-token"
  });

  assert.deepEqual(cursors, [undefined, "PAGE2", "PAGE3"]);
  assert.equal(result.messagesCollected, 3);
});
