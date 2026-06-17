import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const uploadRoot = path.join(process.cwd(), "public", "uploads", "posts");
const publicPrefix = "/uploads/posts";

const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const maxImages = 5;
const maxBytesPerImage = 5 * 1024 * 1024;

export type StoredImage = {
  url: string;
  filename: string;
  contentType: string;
  size: number;
  sortOrder: number;
  storageType: "LOCAL";
  storageKey: string;
  sourceUrl: null;
  altText: null;
  width: null;
  height: null;
  metadata: {
    uploadRoot: string;
  };
};

export function validatePostImageFiles(files: File[]) {
  if (files.length > maxImages) {
    throw new Error("이미지는 최대 5장까지 올릴 수 있습니다.");
  }

  for (const file of files) {
    if (!allowedTypes.has(file.type)) {
      throw new Error("jpg, png, webp 이미지만 올릴 수 있습니다.");
    }

    if (file.size > maxBytesPerImage) {
      throw new Error("이미지 한 장은 최대 5MB까지 올릴 수 있습니다.");
    }
  }
}

export async function savePostImages(files: File[]): Promise<StoredImage[]> {
  validatePostImageFiles(files);
  await mkdir(uploadRoot, { recursive: true });

  return Promise.all(
    files.map(async (file, index) => {
      const extension = allowedTypes.get(file.type);
      if (!extension) {
        throw new Error("지원하지 않는 이미지 형식입니다.");
      }

      const filename = `${Date.now()}-${randomUUID()}.${extension}`;
      const bytes = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(uploadRoot, filename), bytes);

      return {
        url: `${publicPrefix}/${filename}`,
        filename,
        contentType: file.type,
        size: file.size,
        sortOrder: index,
        storageType: "LOCAL",
        storageKey: filename,
        sourceUrl: null,
        altText: null,
        width: null,
        height: null,
        metadata: {
          uploadRoot: "public/uploads/posts",
        },
      };
    }),
  );
}

export async function deletePostImages(urls: string[]) {
  await Promise.allSettled(
    urls.map(async (url) => {
      if (!url.startsWith(`${publicPrefix}/`)) {
        return;
      }

      const filename = path.basename(url);
      const targetPath = path.resolve(uploadRoot, filename);
      const rootPath = path.resolve(uploadRoot);

      if (!targetPath.startsWith(rootPath)) {
        return;
      }

      await unlink(targetPath);
    }),
  );
}
