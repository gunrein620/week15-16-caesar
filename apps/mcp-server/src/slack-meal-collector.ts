import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const defaultStorageDir = join(repoRoot, "storage", "slack-meals");

const DEFAULT_MEAL_KEYWORDS = [
  "식단",
  "식단표",
  "메뉴",
  "점심",
  "저녁",
  "중식",
  "석식",
  "조식",
  "밥",
  "lunch",
  "dinner",
  "meal",
  "menu"
];

const IMAGE_FILETYPES = new Set([
  "apng",
  "avif",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "webp"
]);

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/avif": ".avif",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

export type SlackMealCollectorConfig = {
  channelEnvName: "SLACK_MENU_CHANNEL_ID" | "SLACK_CHANNEL_ID";
  channelId: string;
  downloadImages: boolean;
  keywords: string[];
  latest?: string;
  limit: number;
  oldest?: string;
  pageLimit?: number;
  storageDir: string;
  token: string;
  tokenEnvName: "SLACK_BOT_TOKEN";
};

export type SlackHistoryRequest = {
  channelId: string;
  cursor?: string;
  latest?: string;
  limit: number;
  oldest?: string;
};

export type SlackFile = {
  id?: string;
  name?: string;
  title?: string;
  filetype?: string;
  mimetype?: string;
  url_private?: string;
  url_private_download?: string;
  [key: string]: unknown;
};

export type SlackMessage = {
  ts?: string;
  text?: string;
  files?: SlackFile[];
  [key: string]: unknown;
};

export type SlackHistoryPage = {
  messages: SlackMessage[];
  nextCursor?: string;
};

export type SlackDownloadedFile = {
  body: Uint8Array;
  contentType?: string;
};

export type SlackMealApi = {
  fetchHistory(request: SlackHistoryRequest): Promise<SlackHistoryPage>;
  downloadFile(url: string, token: string): Promise<SlackDownloadedFile>;
};

export type SlackMealImageRecord = {
  contentType?: string;
  fileId?: string;
  filename: string;
  localPath?: string;
  mimetype?: string;
  slackUrl?: string;
  status: "downloaded" | "failed" | "skipped";
  title?: string;
  error?: string;
};

export type SlackMealRawRecord = {
  schemaVersion: 1;
  collectedAt: string;
  source: {
    channelId: string;
    messageTs?: string;
    latest?: string;
    oldest?: string;
  };
  message: SlackMessage;
  images: SlackMealImageRecord[];
};

export type CollectSlackMealRawOptions = {
  api: SlackMealApi;
  channelId: string;
  downloadImages?: boolean;
  keywords?: string[];
  latest?: string;
  limit?: number;
  now?: () => Date;
  oldest?: string;
  pageLimit?: number;
  storageDir: string;
  token: string;
};

export type CollectSlackMealRawResult = {
  imageFiles: string[];
  imagesDownloaded: number;
  imagesFailed: number;
  messagesCollected: number;
  rawFiles: string[];
  storageDir: string;
};

export type CollectSlackMealRawOverrides = Partial<
  Pick<
    CollectSlackMealRawOptions,
    "channelId" | "downloadImages" | "keywords" | "latest" | "limit" | "oldest" | "pageLimit" | "storageDir"
  >
>;

export function resolveSlackMealCollectorConfig(
  env: NodeJS.ProcessEnv = process.env
): SlackMealCollectorConfig {
  const token = env.SLACK_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is required for Slack meal raw collection.");
  }

  const mealChannelId = env.SLACK_MENU_CHANNEL_ID?.trim();
  const fallbackChannelId = env.SLACK_CHANNEL_ID?.trim();
  const channelId = mealChannelId || fallbackChannelId;
  if (!channelId) {
    throw new Error("SLACK_MENU_CHANNEL_ID or SLACK_CHANNEL_ID is required for Slack meal raw collection.");
  }

  return {
    channelEnvName: mealChannelId ? "SLACK_MENU_CHANNEL_ID" : "SLACK_CHANNEL_ID",
    channelId,
    downloadImages: parseBoolean(env.SLACK_MEAL_DOWNLOAD_IMAGES, true),
    keywords: parseKeywords(env.SLACK_MEAL_KEYWORDS),
    latest: blankToUndefined(env.SLACK_MEAL_HISTORY_LATEST),
    limit: parsePositiveInteger(env.SLACK_MEAL_HISTORY_LIMIT, 100),
    oldest: blankToUndefined(env.SLACK_MEAL_HISTORY_OLDEST),
    pageLimit: parseOptionalPositiveInteger(env.SLACK_MEAL_HISTORY_PAGE_LIMIT),
    storageDir: resolveSlackMealStorageDir(blankToUndefined(env.SLACK_MEAL_STORAGE_DIR)),
    token,
    tokenEnvName: "SLACK_BOT_TOKEN"
  };
}

export function resolveSlackMealStorageDir(configuredStorageDir?: string): string {
  return configuredStorageDir ? resolve(repoRoot, configuredStorageDir) : defaultStorageDir;
}

export function selectSlackMealMessages(
  messages: SlackMessage[],
  keywords: string[] = DEFAULT_MEAL_KEYWORDS
): SlackMessage[] {
  const normalizedKeywords = keywords.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean);

  return messages.filter((message) => {
    const searchable = [
      message.text,
      ...(message.files ?? []).flatMap((file) => [file.name, file.title, file.mimetype, file.filetype])
    ]
      .filter((value): value is string => typeof value === "string")
      .join("\n")
      .toLowerCase();

    return normalizedKeywords.some((keyword) => searchable.includes(keyword));
  });
}

export async function collectSlackMealRaw(
  options: CollectSlackMealRawOptions
): Promise<CollectSlackMealRawResult> {
  const storageDir = resolveSlackMealStorageDir(options.storageDir);
  const rawDir = join(storageDir, "raw");
  const imageDir = join(storageDir, "images");
  const rawFiles: string[] = [];
  const imageFiles: string[] = [];
  let imagesFailed = 0;

  await mkdir(rawDir, { recursive: true });
  await mkdir(imageDir, { recursive: true });

  const limit = options.limit ?? 100;
  const pageLimit = options.pageLimit;
  const keywords = options.keywords ?? DEFAULT_MEAL_KEYWORDS;
  const downloadImages = options.downloadImages ?? true;
  const collectedAt = (options.now ?? (() => new Date()))().toISOString();
  let cursor: string | undefined;
  let pageCount = 0;

  do {
    const page = await options.api.fetchHistory({
      channelId: options.channelId,
      cursor,
      latest: options.latest,
      limit,
      oldest: options.oldest
    });

    for (const message of selectSlackMealMessages(page.messages, keywords)) {
      const images: SlackMealImageRecord[] = [];

      for (const file of extractSlackImageFiles(message)) {
        const image = await saveSlackImageFile({
          downloadImages,
          file,
          imageDir,
          messageTs: message.ts,
          token: options.token,
          api: options.api
        });

        images.push(image.record);
        if (image.filePath) {
          imageFiles.push(image.filePath);
        }
        if (image.record.status === "failed") {
          imagesFailed += 1;
        }
      }

      const record: SlackMealRawRecord = {
        schemaVersion: 1,
        collectedAt,
        source: {
          channelId: options.channelId,
          messageTs: message.ts,
          latest: options.latest,
          oldest: options.oldest
        },
        message,
        images
      };
      const rawPath = join(rawDir, `${safeMessagePrefix(message.ts)}.json`);
      await writeJson(rawPath, record);
      rawFiles.push(rawPath);
    }

    cursor = page.nextCursor?.trim() || undefined;
    pageCount += 1;
  } while (cursor && (pageLimit === undefined || pageCount < pageLimit));

  return {
    imageFiles,
    imagesDownloaded: imageFiles.length,
    imagesFailed,
    messagesCollected: rawFiles.length,
    rawFiles,
    storageDir
  };
}

export async function collectSlackMealRawFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  overrides: CollectSlackMealRawOverrides = {}
): Promise<CollectSlackMealRawResult> {
  const config = resolveSlackMealCollectorConfig(env);
  const api = new SlackWebApi(config.token);

  return collectSlackMealRaw({
    api,
    channelId: overrides.channelId ?? config.channelId,
    downloadImages: overrides.downloadImages ?? config.downloadImages,
    keywords: overrides.keywords ?? config.keywords,
    latest: overrides.latest ?? config.latest,
    limit: overrides.limit ?? config.limit,
    oldest: overrides.oldest ?? config.oldest,
    pageLimit: overrides.pageLimit ?? config.pageLimit,
    storageDir: overrides.storageDir ?? config.storageDir,
    token: config.token
  });
}

export class SlackWebApi implements SlackMealApi {
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(token: string, fetchImpl: typeof fetch = fetch) {
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  async fetchHistory(request: SlackHistoryRequest): Promise<SlackHistoryPage> {
    const response = await this.fetchImpl("https://slack.com/api/conversations.history", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        channel: request.channelId,
        cursor: request.cursor,
        latest: request.latest,
        limit: request.limit,
        oldest: request.oldest
      })
    });

    const payload = (await response.json()) as unknown;
    if (!isRecord(payload) || payload.ok !== true) {
      throw new Error(`Slack conversations.history failed: ${slackErrorMessage(payload)}`);
    }

    const messages = Array.isArray(payload.messages) ? (payload.messages as SlackMessage[]) : [];
    const responseMetadata = isRecord(payload.response_metadata) ? payload.response_metadata : {};
    const nextCursor =
      typeof responseMetadata.next_cursor === "string" ? responseMetadata.next_cursor : undefined;

    return { messages, nextCursor };
  }

  async downloadFile(url: string): Promise<SlackDownloadedFile> {
    const response = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${this.token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Slack file download failed: HTTP ${response.status}`);
    }

    return {
      body: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? undefined
    };
  }
}

function extractSlackImageFiles(message: SlackMessage): SlackFile[] {
  return (message.files ?? []).filter(isSlackImageFile);
}

function isSlackImageFile(file: SlackFile): boolean {
  if (typeof file.mimetype === "string" && file.mimetype.startsWith("image/")) {
    return true;
  }

  if (typeof file.filetype === "string" && IMAGE_FILETYPES.has(file.filetype.toLowerCase())) {
    return true;
  }

  if (typeof file.name === "string") {
    const extension = extname(file.name).replace(".", "").toLowerCase();
    return IMAGE_FILETYPES.has(extension);
  }

  return false;
}

async function saveSlackImageFile(args: {
  api: SlackMealApi;
  downloadImages: boolean;
  file: SlackFile;
  imageDir: string;
  messageTs?: string;
  token: string;
}): Promise<{ filePath?: string; record: SlackMealImageRecord }> {
  const slackUrl = typeof args.file.url_private_download === "string"
    ? args.file.url_private_download
    : typeof args.file.url_private === "string"
      ? args.file.url_private
      : undefined;
  const filename = imageFilename(args.messageTs, args.file);
  const baseRecord: Omit<SlackMealImageRecord, "status"> = {
    fileId: typeof args.file.id === "string" ? args.file.id : undefined,
    filename,
    mimetype: typeof args.file.mimetype === "string" ? args.file.mimetype : undefined,
    slackUrl,
    title: typeof args.file.title === "string" ? args.file.title : undefined
  };

  if (!args.downloadImages || !slackUrl) {
    return {
      record: {
        ...baseRecord,
        status: "skipped"
      }
    };
  }

  const filePath = join(args.imageDir, filename);
  try {
    const downloaded = await args.api.downloadFile(slackUrl, args.token);
    assertSlackDownloadedImage(downloaded);
    await writeFile(filePath, downloaded.body);

    return {
      filePath,
      record: {
        ...baseRecord,
        contentType: downloaded.contentType,
        localPath: filePath,
        status: "downloaded"
      }
    };
  } catch (error) {
    return {
      record: {
        ...baseRecord,
        error: error instanceof Error ? error.message : String(error),
        status: "failed"
      }
    };
  }
}

function assertSlackDownloadedImage(downloaded: SlackDownloadedFile): void {
  const contentType = downloaded.contentType?.toLowerCase();

  if (contentType && !contentType.startsWith("image/")) {
    throw new Error(`Slack file download was not an image: ${downloaded.contentType}`);
  }

  if (!isSupportedImageBytes(downloaded.body)) {
    throw new Error("Slack file download was not an image: unsupported image bytes");
  }
}

function imageFilename(messageTs: string | undefined, file: SlackFile): string {
  const originalName = typeof file.name === "string" ? file.name : "";
  const extension = extname(originalName) || mimeExtension(file.mimetype) || ".img";
  const stem = safeFilename(originalName ? originalName.slice(0, -extension.length) : "slack-image");
  const fileId = typeof file.id === "string" ? safeFilename(file.id) : "file";

  return `${safeMessagePrefix(messageTs)}-${fileId}-${stem}${extension.toLowerCase()}`;
}

function safeMessagePrefix(ts: string | undefined): string {
  return `message-${safeFilename(ts ?? "unknown")}`;
}

function safeFilename(value: string): string {
  const safe = value.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe || "unknown";
}

function mimeExtension(mimetype: unknown): string | undefined {
  return typeof mimetype === "string" ? EXTENSION_BY_MIME[mimetype.toLowerCase()] : undefined;
}

function isSupportedImageBytes(bytes: Uint8Array): boolean {
  return isJpeg(bytes) || isPng(bytes) || isGif(bytes) || isWebp(bytes) || isAvif(bytes);
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isGif(bytes: Uint8Array): boolean {
  return bytes.length >= 6 && byteText(bytes, 0, 6).startsWith("GIF");
}

function isWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && byteText(bytes, 0, 4) === "RIFF" && byteText(bytes, 8, 12) === "WEBP";
}

function isAvif(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && byteText(bytes, 4, 8) === "ftyp" && byteText(bytes, 8, 12).includes("avif");
}

function byteText(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseKeywords(value: string | undefined): string[] {
  const parsed = value?.split(",").map((keyword) => keyword.trim()).filter(Boolean);
  return parsed && parsed.length > 0 ? parsed : DEFAULT_MEAL_KEYWORDS;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalPositiveInteger(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function slackErrorMessage(payload: unknown): string {
  if (isRecord(payload) && typeof payload.error === "string") {
    return payload.error;
  }
  return JSON.stringify(payload);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
