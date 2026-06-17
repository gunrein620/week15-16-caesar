import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { resolveSlackMealStorageDir, type SlackMealRawRecord } from "./slack-meal-collector.ts";
const DEFAULT_TIME_ZONE = "Asia/Seoul";

export type SlackMealType = "LUNCH" | "DINNER";

export type SlackMealCandidate = {
  date: string;
  imagePaths: string[];
  items: string[];
  mealType: SlackMealType;
  rawFile: string;
  sourceMessageTs: string;
};

export type SlackMealDuplicate = {
  date: string;
  duplicateSourceMessageTs: string;
  keptSourceMessageTs: string;
  mealType: SlackMealType;
  reason: "image-preferred" | "latest-preferred";
};

export type SlackMealCandidateFile = {
  schemaVersion: 1;
  generatedAt: string;
  sourceDir: string;
  summary: {
    duplicateCount: number;
    parsedCandidateCount: number;
    rawFileCount: number;
    skippedCount: number;
    uniqueMealCount: number;
  };
  candidates: SlackMealCandidate[];
  duplicates: SlackMealDuplicate[];
};

export type BuildSlackMealCandidateFileOptions = {
  candidates: SlackMealCandidate[];
  generatedAt: string;
  rawFileCount: number;
  sourceDir: string;
};

export type WriteSlackMealCandidateFileOptions = {
  generatedAt?: () => Date;
  outputPath?: string;
  rawDir?: string;
  storageDir?: string;
};

export function parseSlackMealCandidate(
  record: SlackMealRawRecord,
  rawFile: string
): SlackMealCandidate | null {
  const text = normalizeText(record.message.text);

  if (!text || isTestMessage(text)) {
    return null;
  }

  const mealType = parseMealType(text);
  const date = parseMealDate(text, record.source.messageTs ?? record.message.ts);
  const items = extractMenuItems(text);
  const sourceMessageTs = record.source.messageTs ?? record.message.ts;

  if (!mealType || !date || !sourceMessageTs || items.length === 0) {
    return null;
  }

  return {
    date,
    imagePaths: record.images
      .filter(isUsableDownloadedImage)
      .map((image) => image.localPath as string),
    items,
    mealType,
    rawFile,
    sourceMessageTs
  };
}

function isUsableDownloadedImage(image: SlackMealRawRecord["images"][number]): boolean {
  if (image.status !== "downloaded" || typeof image.localPath !== "string") {
    return false;
  }

  if (typeof image.contentType === "string" && !image.contentType.toLowerCase().startsWith("image/")) {
    return false;
  }

  return true;
}

export function buildSlackMealCandidateFile(
  options: BuildSlackMealCandidateFileOptions
): SlackMealCandidateFile {
  const unique = new Map<string, SlackMealCandidate>();
  const duplicates: SlackMealDuplicate[] = [];

  for (const candidate of options.candidates) {
    const key = `${candidate.date}:${candidate.mealType}`;
    const current = unique.get(key);

    if (!current) {
      unique.set(key, candidate);
      continue;
    }

    const better = chooseBetterCandidate(current, candidate);
    const duplicate = better === candidate ? current : candidate;
    unique.set(key, better);
    duplicates.push({
      date: candidate.date,
      duplicateSourceMessageTs: duplicate.sourceMessageTs,
      keptSourceMessageTs: better.sourceMessageTs,
      mealType: candidate.mealType,
      reason: better.imagePaths.length > 0 && duplicate.imagePaths.length === 0
        ? "image-preferred"
        : "latest-preferred"
    });
  }

  const candidates = [...unique.values()].sort(compareCandidates);

  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt,
    sourceDir: options.sourceDir,
    summary: {
      duplicateCount: duplicates.length,
      parsedCandidateCount: options.candidates.length,
      rawFileCount: options.rawFileCount,
      skippedCount: options.rawFileCount - options.candidates.length,
      uniqueMealCount: candidates.length
    },
    candidates,
    duplicates: duplicates.sort(compareDuplicates)
  };
}

export async function writeSlackMealCandidateFile(
  options: WriteSlackMealCandidateFileOptions = {}
): Promise<SlackMealCandidateFile> {
  const storageDir = resolveSlackMealStorageDir(options.storageDir ?? process.env.SLACK_MEAL_STORAGE_DIR);
  const rawDir = resolve(options.rawDir ?? join(storageDir, "raw"));
  const outputPath = resolve(options.outputPath ?? join(storageDir, "parsed", "menu-candidates.json"));
  const rawFiles = (await readdir(rawDir))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const candidates: SlackMealCandidate[] = [];

  for (const rawFile of rawFiles) {
    const rawPath = join(rawDir, rawFile);
    const record = JSON.parse(await readFile(rawPath, "utf8")) as SlackMealRawRecord;
    const candidate = parseSlackMealCandidate(record, rawFile);

    if (candidate) {
      candidates.push(candidate);
    }
  }

  const output = buildSlackMealCandidateFile({
    candidates,
    generatedAt: (options.generatedAt ?? (() => new Date()))().toISOString(),
    rawFileCount: rawFiles.length,
    sourceDir: rawDir
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  return output;
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return decodeHtmlEntities(value)
    .replace(/\r/g, "")
    .replace(/<!channel>/g, "")
    .replace(/@everyone/g, "")
    .trim();
}

function isTestMessage(text: string): boolean {
  return /\[TEST\]/i.test(text);
}

function parseMealType(text: string): SlackMealType | null {
  const menuMatch = /(중식|점심|lunch|석식|저녁|dinner)\s*메뉴/i.exec(text);
  const token = menuMatch?.[1]?.toLowerCase();

  if (token === "중식" || token === "점심" || token === "lunch") {
    return "LUNCH";
  }

  if (token === "석식" || token === "저녁" || token === "dinner") {
    return "DINNER";
  }

  if (/중식|점심|lunch/i.test(text)) {
    return "LUNCH";
  }

  if (/석식|저녁|dinner/i.test(text)) {
    return "DINNER";
  }

  return null;
}

function parseMealDate(text: string, slackTs: string | undefined): string | null {
  const match = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(text);

  if (!match) {
    return null;
  }

  const month = Number(match[1]);
  const day = Number(match[2]);

  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return `${yearFromSlackTs(slackTs)}-${pad2(month)}-${pad2(day)}`;
}

function yearFromSlackTs(slackTs: string | undefined): number {
  const seconds = slackTs ? Number.parseFloat(slackTs) : Number.NaN;

  if (Number.isFinite(seconds) && seconds > 0) {
    const date = new Date(seconds * 1000);
    const year = new Intl.DateTimeFormat("en-US", {
      timeZone: DEFAULT_TIME_ZONE,
      year: "numeric"
    }).format(date);
    return Number(year);
  }

  return new Date().getFullYear();
}

function extractMenuItems(text: string): string[] {
  const lines = text.split("\n").map((line) => line.trim());
  const markerIndex = lines.findIndex((line) => /(중식|점심|석식|저녁|lunch|dinner)\s*메뉴/i.test(line));

  if (markerIndex < 0) {
    return [];
  }

  const items: string[] = [];

  for (const line of lines.slice(markerIndex + 1)) {
    const item = parseMenuItemLine(line);

    if (!item) {
      continue;
    }

    if (!items.includes(item)) {
      items.push(item);
    }
  }

  return items;
}

function parseMenuItemLine(line: string): string | null {
  const match = /^\s*[-*•]\s*(.+?)\s*$/.exec(line);

  if (!match) {
    return null;
  }

  const item = decodeHtmlEntities(match[1])
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!item || /메뉴|시간|channel|everyone/i.test(item)) {
    return null;
  }

  return item;
}

function chooseBetterCandidate(
  current: SlackMealCandidate,
  candidate: SlackMealCandidate
): SlackMealCandidate {
  if (candidate.imagePaths.length > 0 && current.imagePaths.length === 0) {
    return candidate;
  }

  if (current.imagePaths.length > 0 && candidate.imagePaths.length === 0) {
    return current;
  }

  return Number.parseFloat(candidate.sourceMessageTs) > Number.parseFloat(current.sourceMessageTs)
    ? candidate
    : current;
}

function compareCandidates(left: SlackMealCandidate, right: SlackMealCandidate): number {
  return left.date.localeCompare(right.date) || mealOrder(left.mealType) - mealOrder(right.mealType);
}

function compareDuplicates(left: SlackMealDuplicate, right: SlackMealDuplicate): number {
  return left.date.localeCompare(right.date) || mealOrder(left.mealType) - mealOrder(right.mealType);
}

function mealOrder(mealType: SlackMealType): number {
  return mealType === "LUNCH" ? 0 : 1;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
