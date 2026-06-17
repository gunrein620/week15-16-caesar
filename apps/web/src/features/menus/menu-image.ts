import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import {
  assertMenuImageFilename,
  MENU_IMAGE_API_PREFIX,
  normalizeMenuImageUrl,
  slackMealImageFilenameFromPath,
  storedMenuImageFilenameFromPath
} from "./menu-image-url.ts";

export { normalizeMealPhotoUrl, normalizeMenuImageUrl } from "./menu-image-url.ts";

const SUPPORTED_IMAGE_CONTENT_TYPES = new Map([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"]
]);

export type ResolveMenuImageFilePathOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  menuImageDir?: string;
  storageDir?: string;
};

export async function normalizeExistingMenuImageUrl(
  imageUrl: string | null,
  options: ResolveMenuImageFilePathOptions = {}
): Promise<string | null> {
  const localFilename = menuImageFilenameFromPath(imageUrl, options);

  if (!localFilename) {
    return normalizeMenuImageUrl(imageUrl);
  }

  try {
    await readValidMenuImageFile(localFilename, options);
    return `${MENU_IMAGE_API_PREFIX}${encodeURIComponent(localFilename)}`;
  } catch {
    return null;
  }
}

export function resolveMenuImageFilePath(
  filename: string,
  options: ResolveMenuImageFilePathOptions = {}
): string {
  const safeFilename = assertMenuImageFilename(filename);

  if (options.menuImageDir) {
    return join(options.menuImageDir, safeFilename);
  }

  if (options.storageDir) {
    return join(options.storageDir, "images", safeFilename);
  }

  const storedMenuImagePath = join(/*turbopackIgnore: true*/ resolveStoredMenuImageDir(options), safeFilename);

  if (existsSync(/*turbopackIgnore: true*/ storedMenuImagePath)) {
    return storedMenuImagePath;
  }

  return join(/*turbopackIgnore: true*/ resolveSlackMealStorageDir(options), "images", safeFilename);
}

export function contentTypeForMenuImage(filename: string): string {
  return SUPPORTED_IMAGE_CONTENT_TYPES.get(extname(filename).toLowerCase()) ?? "application/octet-stream";
}

export async function readValidMenuImageFile(
  filename: string,
  options: ResolveMenuImageFilePathOptions = {}
): Promise<Uint8Array> {
  const imageBytes = await readFile(/*turbopackIgnore: true*/ resolveMenuImageFilePath(filename, options));

  if (!isSupportedImageBytes(imageBytes)) {
    throw new Error("menu image file is not a supported image");
  }

  return imageBytes;
}

export function isSupportedImageBytes(bytes: Uint8Array): boolean {
  return isJpeg(bytes) || isPng(bytes) || isGif(bytes) || isWebp(bytes) || isAvif(bytes);
}

function menuImageFilenameFromPath(
  pathText: string | null,
  options: ResolveMenuImageFilePathOptions
): string | null {
  const value = pathText?.trim();

  if (!value) {
    return null;
  }

  const markedFilename = storedMenuImageFilenameFromPath(value) ?? slackMealImageFilenameFromPath(value);

  if (markedFilename) {
    return markedFilename;
  }

  const resolvedPath = resolve(/*turbopackIgnore: true*/ value);
  const storedRelativePath = relative(resolveStoredMenuImageDir(options), resolvedPath);

  if (storedRelativePath && !storedRelativePath.startsWith("..") && !isAbsolute(storedRelativePath)) {
    return assertMenuImageFilename(storedRelativePath);
  }

  const slackImageDir = resolve(/*turbopackIgnore: true*/ resolveSlackMealStorageDir(options), "images");
  const slackRelativePath = relative(slackImageDir, resolvedPath);

  if (!slackRelativePath || slackRelativePath.startsWith("..") || isAbsolute(slackRelativePath)) {
    return null;
  }

  return assertMenuImageFilename(slackRelativePath);
}

function resolveSlackMealStorageDir(options: ResolveMenuImageFilePathOptions): string {
  if (options.storageDir) {
    return resolve(/*turbopackIgnore: true*/ options.storageDir);
  }

  const cwd = options.cwd ?? /*turbopackIgnore: true*/ process.cwd();
  const env = options.env ?? process.env;
  const configuredStorageDir = env.SLACK_MEAL_STORAGE_DIR?.trim();
  const workspaceRoot = resolveWorkspaceRoot(cwd);

  if (configuredStorageDir) {
    return isAbsolute(configuredStorageDir)
      ? configuredStorageDir
      : resolve(workspaceRoot, /*turbopackIgnore: true*/ configuredStorageDir);
  }

  return resolve(workspaceRoot, "storage", "slack-meals");
}

function resolveStoredMenuImageDir(options: ResolveMenuImageFilePathOptions): string {
  if (options.menuImageDir) {
    return resolve(/*turbopackIgnore: true*/ options.menuImageDir);
  }

  const cwd = options.cwd ?? /*turbopackIgnore: true*/ process.cwd();
  const workspaceRoot = resolveWorkspaceRoot(cwd);

  return resolve(workspaceRoot, "storage", "menu-images");
}

function resolveWorkspaceRoot(cwd: string): string {
  const normalized = resolve(cwd);
  const normalizedParts = normalized.replace(/\\/g, "/").split("/");

  if (normalizedParts.at(-1) === "web" && normalizedParts.at(-2) === "apps") {
    return resolve(normalized, "..", "..");
  }

  return normalized;
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
