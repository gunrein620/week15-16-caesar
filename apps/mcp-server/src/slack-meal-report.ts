import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { resolveSlackMealStorageDir } from "./slack-meal-collector.ts";
import type {
  SlackMealCandidate,
  SlackMealCandidateFile,
  SlackMealType
} from "./slack-meal-parser.ts";

const REQUIRED_MEAL_TYPES: SlackMealType[] = ["LUNCH", "DINNER"];
const DEFAULT_MIN_ITEM_COUNT = 2;

export type SlackMealCandidateRef = {
  date: string;
  mealType: SlackMealType;
  rawFile: string;
  sourceMessageTs: string;
};

export type SlackMealDateCoverage = {
  date: string;
  missingMealTypes: SlackMealType[];
  presentMealTypes: SlackMealType[];
};

export type SlackMealSuspiciousCandidate = SlackMealCandidateRef & {
  items: string[];
  reasons: Array<"too-few-items" | "noise-item">;
};

export type SlackMealCandidateReportFile = {
  schemaVersion: 1;
  generatedAt: string;
  sourceFile: string;
  summary: {
    candidateCount: number;
    completeDateCount: number;
    dateCount: number;
    duplicateCount: number;
    imageMissingCount: number;
    incompleteDateCount: number;
    missingMealEntryCount: number;
    suspiciousCandidateCount: number;
  };
  dateCoverage: SlackMealDateCoverage[];
  imageMissingCandidates: SlackMealCandidateRef[];
  suspiciousCandidates: SlackMealSuspiciousCandidate[];
};

export type BuildSlackMealCandidateReportOptions = {
  candidateFile: SlackMealCandidateFile;
  generatedAt: string;
  minItemCount?: number;
  sourceFile: string;
};

export type WriteSlackMealCandidateReportFileOptions = {
  candidatePath?: string;
  generatedAt?: () => Date;
  minItemCount?: number;
  outputPath?: string;
  storageDir?: string;
};

export function buildSlackMealCandidateReport(
  options: BuildSlackMealCandidateReportOptions
): SlackMealCandidateReportFile {
  const minItemCount = options.minItemCount ?? DEFAULT_MIN_ITEM_COUNT;
  const candidates = options.candidateFile.candidates;
  const dateCoverage = buildDateCoverage(candidates);
  const imageMissingCandidates = candidates
    .filter((candidate) => candidate.imagePaths.length === 0)
    .map(candidateRef)
    .sort(compareCandidateRefs);
  const suspiciousCandidates = candidates
    .map((candidate) => buildSuspiciousCandidate(candidate, minItemCount))
    .filter((candidate): candidate is SlackMealSuspiciousCandidate => candidate !== null)
    .sort(compareCandidateRefs);
  const missingMealEntryCount = dateCoverage.reduce(
    (total, entry) => total + entry.missingMealTypes.length,
    0
  );

  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt,
    sourceFile: options.sourceFile,
    summary: {
      candidateCount: candidates.length,
      completeDateCount: dateCoverage.filter((entry) => entry.missingMealTypes.length === 0).length,
      dateCount: dateCoverage.length,
      duplicateCount: options.candidateFile.summary.duplicateCount,
      imageMissingCount: imageMissingCandidates.length,
      incompleteDateCount: dateCoverage.filter((entry) => entry.missingMealTypes.length > 0).length,
      missingMealEntryCount,
      suspiciousCandidateCount: suspiciousCandidates.length
    },
    dateCoverage,
    imageMissingCandidates,
    suspiciousCandidates
  };
}

export async function writeSlackMealCandidateReportFile(
  options: WriteSlackMealCandidateReportFileOptions = {}
): Promise<SlackMealCandidateReportFile> {
  const storageDir = resolveSlackMealStorageDir(options.storageDir ?? process.env.SLACK_MEAL_STORAGE_DIR);
  const candidatePath = resolve(options.candidatePath ?? join(storageDir, "parsed", "menu-candidates.json"));
  const outputPath = resolve(options.outputPath ?? join(storageDir, "parsed", "menu-candidates-report.json"));
  const candidateFile = JSON.parse(await readFile(candidatePath, "utf8")) as SlackMealCandidateFile;
  const report = buildSlackMealCandidateReport({
    candidateFile,
    generatedAt: (options.generatedAt ?? (() => new Date()))().toISOString(),
    minItemCount: options.minItemCount,
    sourceFile: candidatePath
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  return report;
}

function buildDateCoverage(candidates: SlackMealCandidate[]): SlackMealDateCoverage[] {
  const byDate = new Map<string, Set<SlackMealType>>();

  for (const candidate of candidates) {
    const mealTypes = byDate.get(candidate.date) ?? new Set<SlackMealType>();
    mealTypes.add(candidate.mealType);
    byDate.set(candidate.date, mealTypes);
  }

  return [...byDate.entries()]
    .map(([date, mealTypes]) => {
      const presentMealTypes = REQUIRED_MEAL_TYPES.filter((mealType) => mealTypes.has(mealType));

      return {
        date,
        missingMealTypes: REQUIRED_MEAL_TYPES.filter((mealType) => !mealTypes.has(mealType)),
        presentMealTypes
      };
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

function buildSuspiciousCandidate(
  candidate: SlackMealCandidate,
  minItemCount: number
): SlackMealSuspiciousCandidate | null {
  const reasons: SlackMealSuspiciousCandidate["reasons"] = [];

  if (candidate.items.length < minItemCount) {
    reasons.push("too-few-items");
  }

  if (candidate.items.some(isNoiseItem)) {
    reasons.push("noise-item");
  }

  if (reasons.length === 0) {
    return null;
  }

  return {
    ...candidateRef(candidate),
    items: candidate.items,
    reasons
  };
}

function isNoiseItem(item: string): boolean {
  return /\[TEST\]|slack\s*connection|channel|everyone|menu\s*time/i.test(item);
}

function candidateRef(candidate: SlackMealCandidate): SlackMealCandidateRef {
  return {
    date: candidate.date,
    mealType: candidate.mealType,
    rawFile: candidate.rawFile,
    sourceMessageTs: candidate.sourceMessageTs
  };
}

function compareCandidateRefs(
  left: SlackMealCandidateRef,
  right: SlackMealCandidateRef
): number {
  return left.date.localeCompare(right.date) || mealOrder(left.mealType) - mealOrder(right.mealType);
}

function mealOrder(mealType: SlackMealType): number {
  return mealType === "LUNCH" ? 0 : 1;
}
