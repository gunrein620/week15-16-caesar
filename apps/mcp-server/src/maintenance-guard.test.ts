import assert from "node:assert/strict";
import test from "node:test";
import { isMaintenanceConfirmed } from "./maintenance-guard.ts";

test("isMaintenanceConfirmed requires an explicit yes flag", () => {
  assert.equal(isMaintenanceConfirmed(["node", "script.ts"]), false);
  assert.equal(isMaintenanceConfirmed(["node", "script.ts", "--dry-run"]), false);
  assert.equal(isMaintenanceConfirmed(["node", "script.ts", "--yes"]), true);
});
