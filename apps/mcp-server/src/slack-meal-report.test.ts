import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildSlackMealCandidateReport,
  writeSlackMealCandidateReportFile
} from "./slack-meal-report.ts";
import type {
  SlackMealCandidate,
  SlackMealCandidateFile,
  SlackMealType
} from "./slack-meal-parser.ts";

test("buildSlackMealCandidateReport summarizes date coverage and missing meals", () => {
  const report = buildSlackMealCandidateReport({
    candidateFile: candidateFile([
      candidate("2026-04-21", "LUNCH"),
      candidate("2026-04-21", "DINNER"),
      candidate("2026-04-22", "DINNER")
    ]),
    generatedAt: "2026-06-08T12:00:00.000Z",
    sourceFile: "menu-candidates.json"
  });

  assert.equal(report.summary.candidateCount, 3);
  assert.equal(report.summary.dateCount, 2);
  assert.equal(report.summary.completeDateCount, 1);
  assert.equal(report.summary.incompleteDateCount, 1);
  assert.equal(report.summary.missingMealEntryCount, 1);
  assert.deepEqual(report.dateCoverage, [
    {
      date: "2026-04-21",
      missingMealTypes: [],
      presentMealTypes: ["LUNCH", "DINNER"]
    },
    {
      date: "2026-04-22",
      missingMealTypes: ["LUNCH"],
      presentMealTypes: ["DINNER"]
    }
  ]);
});

test("buildSlackMealCandidateReport reports image gaps and suspicious menu items", () => {
  const report = buildSlackMealCandidateReport({
    candidateFile: candidateFile([
      candidate("2026-04-21", "LUNCH", {
        imagePaths: [],
        items: ["OnlyOneItem"]
      }),
      candidate("2026-04-21", "DINNER", {
        imagePaths: ["dinner.jpg"],
        items: ["Normal item", "[TEST] leftover"]
      })
    ]),
    generatedAt: "2026-06-08T12:00:00.000Z",
    minItemCount: 2,
    sourceFile: "menu-candidates.json"
  });

  assert.equal(report.summary.imageMissingCount, 1);
  assert.deepEqual(report.imageMissingCandidates.map((entry) => entry.mealType), ["LUNCH"]);
  assert.equal(report.summary.suspiciousCandidateCount, 2);
  assert.deepEqual(
    report.suspiciousCandidates.map((entry) => entry.reasons),
    [["too-few-items"], ["noise-item"]]
  );
});

test("writeSlackMealCandidateReportFile reads candidates and writes a report JSON file", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "slack-meals-"));
  const parsedDir = join(storageDir, "parsed");
  const candidatePath = join(parsedDir, "menu-candidates.json");
  const reportPath = join(parsedDir, "menu-candidates-report.json");
  await writeFileTree(
    candidatePath,
    candidateFile([
      candidate("2026-04-21", "LUNCH"),
      candidate("2026-04-21", "DINNER", { imagePaths: [] })
    ])
  );

  const report = await writeSlackMealCandidateReportFile({
    candidatePath,
    generatedAt: () => new Date("2026-06-08T12:00:00.000Z"),
    outputPath: reportPath
  });

  assert.equal(report.summary.candidateCount, 2);
  assert.equal(report.summary.imageMissingCount, 1);

  const written = JSON.parse(await readFile(reportPath, "utf8")) as typeof report;
  assert.equal(written.generatedAt, "2026-06-08T12:00:00.000Z");
  assert.equal(written.summary.completeDateCount, 1);
});

function candidate(
  date: string,
  mealType: SlackMealType,
  overrides: Partial<SlackMealCandidate> = {}
): SlackMealCandidate {
  return {
    date,
    imagePaths: ["image.jpg"],
    items: ["Rice", "Soup", "Kimchi"],
    mealType,
    rawFile: `message-${date}-${mealType}.json`,
    sourceMessageTs: mealType === "LUNCH" ? "1776738609.179659" : "1776760210.757369",
    ...overrides
  };
}

function candidateFile(candidates: SlackMealCandidate[]): SlackMealCandidateFile {
  return {
    schemaVersion: 1,
    candidates,
    duplicates: [],
    generatedAt: "2026-06-08T12:00:00.000Z",
    sourceDir: "storage/slack-meals/raw",
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
