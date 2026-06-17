import assert from "node:assert/strict";
import test from "node:test";
import { isSecureCookie } from "./session-cookie.ts";

test("isSecureCookie is false for plain HTTP requests", () => {
  assert.equal(isSecureCookie(new Request("http://junglebob.test/api/auth/login")), false);
});

test("isSecureCookie is true for HTTPS requests", () => {
  assert.equal(isSecureCookie(new Request("https://junglebob.test/api/auth/login")), true);
});

test("isSecureCookie uses x-forwarded-proto when present", () => {
  const request = new Request("http://127.0.0.1:3000/api/auth/login", {
    headers: { "x-forwarded-proto": "https" }
  });

  assert.equal(isSecureCookie(request), true);
});

test("isSecureCookie can be forced by SESSION_COOKIE_SECURE", () => {
  const original = process.env.SESSION_COOKIE_SECURE;
  process.env.SESSION_COOKIE_SECURE = "false";

  try {
    assert.equal(isSecureCookie(new Request("https://junglebob.test/api/auth/login")), false);
  } finally {
    if (original === undefined) {
      delete process.env.SESSION_COOKIE_SECURE;
    } else {
      process.env.SESSION_COOKIE_SECURE = original;
    }
  }
});
