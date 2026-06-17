import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  contentTypeForMenuImage,
  normalizeMealPhotoUrl,
  normalizeExistingMenuImageUrl,
  normalizeMenuImageUrl,
  resolveMenuImageFilePath
} from "./menu-image.ts";

test("normalizeMenuImageUrl converts Slack meal storage paths to a public API image URL", () => {
  assert.equal(
    normalizeMenuImageUrl("C:\\Users\\smoun\\Jungle\\bob\\storage\\slack-meals\\images\\lunch.jpg"),
    "/api/menu-images/lunch.jpg"
  );
  assert.equal(
    normalizeMenuImageUrl("storage/slack-meals/images/dinner menu.png"),
    "/api/menu-images/dinner%20menu.png"
  );
});

test("normalizeMenuImageUrl converts stored menu image paths to a public API image URL", () => {
  assert.equal(
    normalizeMenuImageUrl("C:\\Users\\smoun\\Jungle\\bob\\storage\\menu-images\\weekly.jpg"),
    "/api/menu-images/weekly.jpg"
  );
  assert.equal(
    normalizeMenuImageUrl("storage/menu-images/dinner menu.png"),
    "/api/menu-images/dinner%20menu.png"
  );
});

test("normalizeMenuImageUrl keeps already-public image URLs unchanged", () => {
  assert.equal(normalizeMenuImageUrl("https://k.kakaocdn.net/menu/img_xl.jpg"), "https://k.kakaocdn.net/menu/img_xl.jpg");
  assert.equal(normalizeMenuImageUrl("/brand/jungle-bob-logo.png"), "/brand/jungle-bob-logo.png");
  assert.equal(normalizeMenuImageUrl(null), null);
});

test("normalizeMealPhotoUrl exposes only actual meal photos", () => {
  assert.equal(normalizeMealPhotoUrl("storage/menu-images/weekly.jpg", "WEEKLY_SHEET"), null);
  assert.equal(normalizeMealPhotoUrl("storage/menu-images/none.jpg", "NONE"), null);
  assert.equal(
    normalizeMealPhotoUrl("storage/slack-meals/images/lunch.jpg", "MEAL_PHOTO"),
    "/api/menu-images/lunch.jpg"
  );
});

test("resolveMenuImageFilePath serves only files under the Slack meal image directory", () => {
  const storageDir = join("C:\\Users\\smoun\\Jungle\\bob", "storage", "slack-meals");

  assert.equal(
    resolveMenuImageFilePath("lunch.jpg", { storageDir }),
    join(storageDir, "images", "lunch.jpg")
  );
  assert.throws(() => resolveMenuImageFilePath("../secret.jpg", { storageDir }), /menu image filename is invalid/);
  assert.throws(() => resolveMenuImageFilePath("secret.txt", { storageDir }), /menu image extension is unsupported/);
});

test("resolveMenuImageFilePath can serve files from the stored menu image directory", () => {
  const menuImageDir = join("C:\\Users\\smoun\\Jungle\\bob", "storage", "menu-images");

  assert.equal(
    resolveMenuImageFilePath("weekly.jpg", { menuImageDir }),
    join(menuImageDir, "weekly.jpg")
  );
});

test("resolveMenuImageFilePath resolves workspace storage when web runs from apps/web", () => {
  const workspaceRoot = resolve("workspace-root");
  const webCwd = join(workspaceRoot, "apps", "web");

  assert.equal(
    resolveMenuImageFilePath("lunch.jpg", { cwd: webCwd, env: { NODE_ENV: "test" } }),
    join(workspaceRoot, "storage", "slack-meals", "images", "lunch.jpg")
  );
});

test("contentTypeForMenuImage returns an image content type from the filename extension", () => {
  assert.equal(contentTypeForMenuImage("menu.jpg"), "image/jpeg");
  assert.equal(contentTypeForMenuImage("menu.png"), "image/png");
});

test("normalizeExistingMenuImageUrl returns null when a local Slack image file is actually HTML", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "menu-images-"));
  const imageDir = join(storageDir, "images");
  const filename = "not-an-image.jpg";
  await mkdir(imageDir);
  await writeFile(join(imageDir, filename), "<!DOCTYPE html><html></html>");

  assert.equal(
    await normalizeExistingMenuImageUrl(join(storageDir, "images", filename), { storageDir }),
    null
  );
});

test("normalizeExistingMenuImageUrl keeps a stored menu image URL when the file bytes are an image", async () => {
  const menuImageDir = await mkdtemp(join(tmpdir(), "stored-menu-images-"));
  const filename = "weekly.jpg";
  await writeFile(join(menuImageDir, filename), new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));

  assert.equal(
    await normalizeExistingMenuImageUrl(join(menuImageDir, filename), { menuImageDir }),
    `/api/menu-images/${filename}`
  );
});

test("normalizeExistingMenuImageUrl keeps a local Slack image URL when the file bytes are an image", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "menu-images-"));
  const imageDir = join(storageDir, "images");
  const filename = "actual-image.jpg";
  await mkdir(imageDir);
  await writeFile(join(imageDir, filename), new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));

  assert.equal(
    await normalizeExistingMenuImageUrl(join(storageDir, "images", filename), { storageDir }),
    `/api/menu-images/${filename}`
  );
});
