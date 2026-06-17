import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildMenuArchiveImportInputs,
  importSlackMealCandidatesToMenuArchive,
  type MenuArchiveImportStore
} from "./slack-meal-importer.ts";
import type {
  SlackMealCandidate,
  SlackMealCandidateFile,
  SlackMealType
} from "./slack-meal-parser.ts";

test("buildMenuArchiveImportInputs maps Slack candidates to MenuArchive upsert inputs", () => {
  const inputs = buildMenuArchiveImportInputs({
    candidateFile: candidateFile([
      candidate("2026-04-21", "LUNCH", {
        imagePaths: ["storage/slack-meals/images/lunch.jpg"],
        items: ["탄탄멘", "배추김치"],
        sourceMessageTs: "1776738609.179659"
      })
    ]),
    rawTextByRawFile: new Map([
      ["message-2026-04-21-LUNCH.json", "4월 21일(화) 중식 메뉴\n- 탄탄멘\n- 배추김치"]
    ]),
    syncedAt: new Date("2026-06-08T12:00:00.000Z")
  });

  assert.deepEqual(inputs, [
    {
      date: "2026-04-21",
      imageType: "MEAL_PHOTO",
      imageUrl: "storage/slack-meals/images/lunch.jpg",
      items: ["탄탄멘", "배추김치"],
      mealType: "LUNCH",
      rawText: "4월 21일(화) 중식 메뉴\n- 탄탄멘\n- 배추김치",
      sourceId: "1776738609.179659",
      sourceType: "SLACK",
      syncedAt: new Date("2026-06-08T12:00:00.000Z")
    }
  ]);
});

test("buildMenuArchiveImportInputs falls back to candidate items when raw text is unavailable", () => {
  const inputs = buildMenuArchiveImportInputs({
    candidateFile: candidateFile([
      candidate("2026-04-21", "DINNER", {
        imagePaths: [],
        items: ["누룽지찜닭", "잡곡밥"]
      })
    ]),
    syncedAt: new Date("2026-06-08T12:00:00.000Z")
  });

  assert.equal(inputs[0]?.imageUrl, null);
  assert.equal(inputs[0]?.imageType, "NONE");
  assert.equal(inputs[0]?.rawText, "- 누룽지찜닭\n- 잡곡밥");
});

test("importSlackMealCandidatesToMenuArchive reads candidate and raw files then upserts each meal", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "slack-meals-"));
  const rawDir = join(storageDir, "raw");
  const parsedDir = join(storageDir, "parsed");
  const candidatePath = join(parsedDir, "menu-candidates.json");
  const calls: unknown[] = [];
  const store: MenuArchiveImportStore = {
    async upsertMenuArchive(input) {
      calls.push(input);
    }
  };

  await writeFileTree(
    candidatePath,
    candidateFile([
      candidate("2026-04-21", "LUNCH", {
        items: ["탄탄멘", "배추김치"],
        sourceMessageTs: "1776738609.179659"
      }),
      candidate("2026-04-21", "DINNER", {
        items: ["누룽지찜닭", "잡곡밥"],
        sourceMessageTs: "1776760210.757369"
      })
    ], rawDir)
  );
  await writeFileTree(
    join(rawDir, "message-2026-04-21-LUNCH.json"),
    {
      message: {
        text: "4월 21일(화) 중식 메뉴\n- 탄탄멘\n- 배추김치"
      }
    }
  );

  const result = await importSlackMealCandidatesToMenuArchive({
    candidatePath,
    store,
    syncedAt: () => new Date("2026-06-08T12:00:00.000Z")
  });

  assert.deepEqual(result, {
    importedCount: 2,
    sourceCandidateCount: 2
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls, [
    {
      date: "2026-04-21",
      imageType: "NONE",
      imageUrl: null,
      items: ["탄탄멘", "배추김치"],
      mealType: "LUNCH",
      rawText: "4월 21일(화) 중식 메뉴\n- 탄탄멘\n- 배추김치",
      sourceId: "1776738609.179659",
      sourceType: "SLACK",
      syncedAt: new Date("2026-06-08T12:00:00.000Z")
    },
    {
      date: "2026-04-21",
      imageType: "NONE",
      imageUrl: null,
      items: ["누룽지찜닭", "잡곡밥"],
      mealType: "DINNER",
      rawText: "- 누룽지찜닭\n- 잡곡밥",
      sourceId: "1776760210.757369",
      sourceType: "SLACK",
      syncedAt: new Date("2026-06-08T12:00:00.000Z")
    }
  ]);
});

function candidate(
  date: string,
  mealType: SlackMealType,
  overrides: Partial<SlackMealCandidate> = {}
): SlackMealCandidate {
  return {
    date,
    imagePaths: [],
    items: ["메뉴"],
    mealType,
    rawFile: `message-${date}-${mealType}.json`,
    sourceMessageTs: mealType === "LUNCH" ? "1776738609.179659" : "1776760210.757369",
    ...overrides
  };
}

function candidateFile(
  candidates: SlackMealCandidate[],
  sourceDir = "storage/slack-meals/raw"
): SlackMealCandidateFile {
  return {
    schemaVersion: 1,
    candidates,
    duplicates: [],
    generatedAt: "2026-06-08T12:00:00.000Z",
    sourceDir,
    summary: {
      duplicateCount: 0,
      parsedCandidateCount: candidates.length,
      rawFileCount: candidates.length,
      skippedCount: 0,
      uniqueMealCount: candidates.length
    }
  };
}

async function writeFileTree(path: string, value: unknown): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
