import assert from "node:assert/strict";
import test from "node:test";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword
} from "./auth.ts";

test("hashPassword creates a non-plain hash that verifyPassword accepts", async () => {
  const password = "jungle-meal-password";

  const hash = await hashPassword(password);

  assert.notEqual(hash, password);
  assert.equal(await verifyPassword(password, hash), true);
});

test("verifyPassword rejects the wrong password", async () => {
  const hash = await hashPassword("correct-password");

  assert.equal(await verifyPassword("wrong-password", hash), false);
});

test("createSessionToken returns unique URL-safe tokens", () => {
  const first = createSessionToken();
  const second = createSessionToken();

  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
  assert.ok(first.length >= 40);
});

test("hashSessionToken returns a deterministic sha256 hex digest", () => {
  const token = "session-token";

  assert.equal(hashSessionToken(token), hashSessionToken(token));
  assert.match(hashSessionToken(token), /^[a-f0-9]{64}$/);
});
