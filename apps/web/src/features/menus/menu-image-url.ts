import { basename, extname } from "node:path";

export const MENU_IMAGE_API_PREFIX = "/api/menu-images/";
export const MENU_IMAGE_PATH_MARKER = "storage/menu-images/";
export const SLACK_IMAGE_PATH_MARKER = "storage/slack-meals/images/";
export const SUPPORTED_IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpg", ".jpeg", ".png", ".webp"]);

export function normalizeMenuImageUrl(imageUrl: string | null): string | null {
  const value = imageUrl?.trim();

  if (!value) {
    return null;
  }

  if (value.startsWith("/") || /^(https?:|data:|blob:)/i.test(value)) {
    return value;
  }

  const localFilename = storedMenuImageFilenameFromPath(value) ?? slackMealImageFilenameFromPath(value);

  if (localFilename) {
    return `${MENU_IMAGE_API_PREFIX}${encodeURIComponent(localFilename)}`;
  }

  if (/^[a-z]:[\\/]/i.test(value) || value.startsWith("\\\\")) {
    return null;
  }

  return value;
}

export function normalizeMealPhotoUrl(imageUrl: string | null, imageType: string | null): string | null {
  return imageType === "MEAL_PHOTO" ? normalizeMenuImageUrl(imageUrl) : null;
}

export function slackMealImageFilenameFromPath(pathText: string): string | null {
  return imageFilenameFromMarkedPath(pathText, SLACK_IMAGE_PATH_MARKER);
}

export function storedMenuImageFilenameFromPath(pathText: string): string | null {
  return imageFilenameFromMarkedPath(pathText, MENU_IMAGE_PATH_MARKER);
}

export function assertMenuImageFilename(filename: string): string {
  const value = filename.trim();

  if (!value || value !== basename(value) || value.includes("\\") || value.includes("/") || value.includes("\0")) {
    throw new Error("menu image filename is invalid");
  }

  if (!SUPPORTED_IMAGE_EXTENSIONS.has(extname(value).toLowerCase())) {
    throw new Error("menu image extension is unsupported");
  }

  return value;
}

function imageFilenameFromMarkedPath(pathText: string, marker: string): string | null {
  const normalizedPath = pathText.replace(/\\/g, "/");
  const markerIndex = normalizedPath.toLowerCase().lastIndexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const filename = normalizedPath.slice(markerIndex + marker.length).split("/").pop();

  return filename ? assertMenuImageFilename(filename) : null;
}
