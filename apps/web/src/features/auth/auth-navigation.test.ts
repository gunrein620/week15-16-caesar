import assert from "node:assert/strict";
import test from "node:test";
import { navigateAfterAuth } from "./auth-navigation.ts";

test("navigateAfterAuth replaces the login page with the food profile page", () => {
  const calls: string[] = [];

  navigateAfterAuth({
    replace: (href) => {
      calls.push(`replace:${href}`);
    },
    refresh: () => {
      calls.push("refresh");
    }
  });

  assert.deepEqual(calls, ["replace:/profile/food", "refresh"]);
});
