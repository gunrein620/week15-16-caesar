import { prisma } from "@junglebob/db";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { resolveSlackMealStorageDir } from "./slack-meal-collector.ts";
import type {
  SlackMealCandidateFile,
  SlackMealType
} from "./slack-meal-parser.ts";

export type MenuArchiveImportInput = {
  date: string;
  imageType: "MEAL_PHOTO" | "NONE";
  imageUrl: string | null;
  items: string[];
  mealType: SlackMealType;
  rawText: string | null;
  sourceId: string;
  sourceType: "SLACK";
  syncedAt: Date;
};

export type MenuArchiveImportStore = {
  upsertMenuArchive(input: MenuArchiveImportInput): Promise<unknown>;
};

export type BuildMenuArchiveImportInputsOptions = {
  candidateFile: SlackMealCandidateFile;
  rawTextByRawFile?: Map<string, string>;
  syncedAt: Date;
};

export type ImportSlackMealCandidatesOptions = {
  candidatePath?: string;
  store?: MenuArchiveImportStore;
  storageDir?: string;
  syncedAt?: () => Date;
};

export type ImportSlackMealCandidatesResult = {
  importedCount: number;
  sourceCandidateCount: number;
};

export const PRISMA_MENU_ARCHIVE_IMPORT_STORE: MenuArchiveImportStore = {
  async upsertMenuArchive(input) {
    const date = new Date(`${input.date}T00:00:00.000Z`);

    return prisma.menuArchive.upsert({
      where: {
        date_mealType: {
          date,
          mealType: input.mealType
        }
      },
      update: {
        imageType: input.imageType,
        imageUrl: input.imageUrl,
        items: input.items,
        rawText: input.rawText,
        sourceId: input.sourceId,
        sourceType: input.sourceType,
        syncedAt: input.syncedAt
      },
      create: {
        date,
        imageType: input.imageType,
        imageUrl: input.imageUrl,
        items: input.items,
        mealType: input.mealType,
        rawText: input.rawText,
        sourceId: input.sourceId,
        sourceType: input.sourceType,
        syncedAt: input.syncedAt
      }
    });
  }
};

export function buildMenuArchiveImportInputs(
  options: BuildMenuArchiveImportInputsOptions
): MenuArchiveImportInput[] {
  return options.candidateFile.candidates.map((candidate) => ({
    date: candidate.date,
    imageType: candidate.imagePaths[0] ? "MEAL_PHOTO" : "NONE",
    imageUrl: candidate.imagePaths[0] ?? null,
    items: candidate.items,
    mealType: candidate.mealType,
    rawText: options.rawTextByRawFile?.get(candidate.rawFile) ?? fallbackRawText(candidate.items),
    sourceId: candidate.sourceMessageTs,
    sourceType: "SLACK",
    syncedAt: options.syncedAt
  }));
}

export async function importSlackMealCandidatesToMenuArchive(
  options: ImportSlackMealCandidatesOptions = {}
): Promise<ImportSlackMealCandidatesResult> {
  const storageDir = resolveSlackMealStorageDir(options.storageDir ?? process.env.SLACK_MEAL_STORAGE_DIR);
  const candidatePath = resolve(options.candidatePath ?? join(storageDir, "parsed", "menu-candidates.json"));
  const candidateFile = JSON.parse(await readFile(candidatePath, "utf8")) as SlackMealCandidateFile;
  const rawTextByRawFile = await loadRawTextByRawFile(candidateFile);
  const inputs = buildMenuArchiveImportInputs({
    candidateFile,
    rawTextByRawFile,
    syncedAt: (options.syncedAt ?? (() => new Date()))()
  });
  const store = options.store ?? PRISMA_MENU_ARCHIVE_IMPORT_STORE;

  for (const input of inputs) {
    await store.upsertMenuArchive(input);
  }

  return {
    importedCount: inputs.length,
    sourceCandidateCount: candidateFile.candidates.length
  };
}

async function loadRawTextByRawFile(candidateFile: SlackMealCandidateFile): Promise<Map<string, string>> {
  const rawTextByRawFile = new Map<string, string>();

  for (const candidate of candidateFile.candidates) {
    if (rawTextByRawFile.has(candidate.rawFile)) {
      continue;
    }

    const rawPath = join(candidateFile.sourceDir, candidate.rawFile);

    try {
      const payload = JSON.parse(await readFile(rawPath, "utf8")) as {
        message?: {
          text?: unknown;
        };
      };

      if (typeof payload.message?.text === "string" && payload.message.text.trim()) {
        rawTextByRawFile.set(candidate.rawFile, payload.message.text);
      }
    } catch {
      // Candidate items are still importable when the original raw file is missing.
    }
  }

  return rawTextByRawFile;
}

function fallbackRawText(items: string[]): string | null {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : null;
}
