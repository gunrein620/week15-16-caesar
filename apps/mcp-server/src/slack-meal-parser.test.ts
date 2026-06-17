import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildSlackMealCandidateFile,
  parseSlackMealCandidate,
  writeSlackMealCandidateFile,
  type SlackMealCandidate
} from "./slack-meal-parser.ts";
import type { SlackMealRawRecord } from "./slack-meal-collector.ts";

test("parseSlackMealCandidate extracts date, meal type, items, and image paths", () => {
  const candidate = parseSlackMealCandidate(
    rawRecord({
      ts: "1776738609.179659",
      text: "<!channel> :monkey_face: 점심 30분 전이에요!\n4월 21일(화) 중식 메뉴\n- 탄탄멘\n- 추가밥(쌀밥)\n- 배추김치&amp;깍두기",
      images: [
        {
          filename: "lunch.jpg",
          localPath: "storage/slack-meals/images/lunch.jpg",
          status: "downloaded"
        }
      ]
    }),
    "message-1776738609.179659.json"
  );

  assert.deepEqual(candidate, {
    date: "2026-04-21",
    imagePaths: ["storage/slack-meals/images/lunch.jpg"],
    items: ["탄탄멘", "추가밥(쌀밥)", "배추김치&깍두기"],
    mealType: "LUNCH",
    rawFile: "message-1776738609.179659.json",
    sourceMessageTs: "1776738609.179659"
  });
});

test("parseSlackMealCandidate ignores downloaded image records with non-image content type", () => {
  const candidate = parseSlackMealCandidate(
    rawRecord({
      text: "6월 4일(목) 중식 메뉴\n- rice",
      ts: "1780539008.058509",
      images: [
        {
          filename: "lunch.jpg",
          localPath: "storage/slack-meals/images/lunch.jpg",
          contentType: "text/html; charset=utf-8",
          status: "downloaded"
        }
      ]
    }),
    "message-1780539008.058509.json"
  );

  assert.deepEqual(candidate?.imagePaths, []);
});

test("parseSlackMealCandidate skips test messages and non-menu messages", () => {
  assert.equal(
    parseSlackMealCandidate(
      rawRecord({
        ts: "1773311248.589979",
        text: "[TEST] Slack 연결 확인용 메시지\n오늘의 점심 메뉴\n* 돈까스카레"
      }),
      "test.json"
    ),
    null
  );

  assert.equal(
    parseSlackMealCandidate(
      rawRecord({
        ts: "1773311248.589979",
        text: "오늘 회의는 3시에 시작합니다"
      }),
      "chat.json"
    ),
    null
  );
});

test("buildSlackMealCandidateFile deduplicates by date and meal with image then latest priority", () => {
  const olderWithoutImage = candidate({
    date: "2026-04-21",
    mealType: "DINNER",
    sourceMessageTs: "1776760000.000000",
    items: ["오래된 메뉴"]
  });
  const newerWithoutImage = candidate({
    date: "2026-04-21",
    mealType: "DINNER",
    sourceMessageTs: "1776760100.000000",
    items: ["최신 텍스트 메뉴"]
  });
  const olderWithImage = candidate({
    date: "2026-04-21",
    imagePaths: ["dinner.jpg"],
    mealType: "DINNER",
    sourceMessageTs: "1776750000.000000",
    items: ["이미지 포함 메뉴"]
  });

  const output = buildSlackMealCandidateFile({
    candidates: [olderWithoutImage, newerWithoutImage, olderWithImage],
    generatedAt: "2026-06-08T12:00:00.000Z",
    rawFileCount: 3,
    sourceDir: "storage/slack-meals/raw"
  });

  assert.equal(output.summary.rawFileCount, 3);
  assert.equal(output.summary.parsedCandidateCount, 3);
  assert.equal(output.summary.uniqueMealCount, 1);
  assert.equal(output.candidates.length, 1);
  assert.deepEqual(output.candidates[0]?.items, ["이미지 포함 메뉴"]);
  assert.equal(output.duplicates.length, 2);
});

test("writeSlackMealCandidateFile reads raw files and writes menu-candidates.json", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "slack-meals-"));
  const rawDir = join(storageDir, "raw");
  const parsedDir = join(storageDir, "parsed");
  await writeFileTree(
    join(rawDir, "message-1776738609.179659.json"),
    rawRecord({
      ts: "1776738609.179659",
      text: "4월 21일(화) 중식 메뉴\n- 탄탄멘\n- 배추김치"
    })
  );
  await writeFileTree(
    join(rawDir, "message-1776760210.757369.json"),
    rawRecord({
      ts: "1776760210.757369",
      text: "4월 21일(화) 석식 메뉴\n- 누룽지찜닭\n- 잡곡밥"
    })
  );

  const result = await writeSlackMealCandidateFile({
    generatedAt: () => new Date("2026-06-08T12:00:00.000Z"),
    rawDir,
    outputPath: join(parsedDir, "menu-candidates.json")
  });

  assert.equal(result.summary.rawFileCount, 2);
  assert.equal(result.summary.uniqueMealCount, 2);

  const written = JSON.parse(
    await readFile(join(parsedDir, "menu-candidates.json"), "utf8")
  ) as typeof result;
  assert.equal(written.candidates[0]?.date, "2026-04-21");
  assert.equal(written.candidates[0]?.mealType, "LUNCH");
  assert.deepEqual(written.candidates[1]?.items, ["누룽지찜닭", "잡곡밥"]);
});

function rawRecord(input: {
  images?: SlackMealRawRecord["images"];
  text: string;
  ts: string;
}): SlackMealRawRecord {
  return {
    schemaVersion: 1,
    collectedAt: "2026-06-08T12:00:00.000Z",
    source: {
      channelId: "CMEAL",
      messageTs: input.ts
    },
    message: {
      text: input.text,
      ts: input.ts
    },
    images: input.images ?? []
  };
}

function candidate(input: Partial<SlackMealCandidate> & Pick<SlackMealCandidate, "date" | "mealType" | "sourceMessageTs">): SlackMealCandidate {
  return {
    date: input.date,
    imagePaths: input.imagePaths ?? [],
    items: input.items ?? ["메뉴"],
    mealType: input.mealType,
    rawFile: input.rawFile ?? `${input.sourceMessageTs}.json`,
    sourceMessageTs: input.sourceMessageTs
  };
}

async function writeFileTree(path: string, value: unknown): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
