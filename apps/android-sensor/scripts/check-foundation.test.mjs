import test from "node:test";
import assert from "node:assert/strict";
import { checkFoundation } from "./check-foundation.mjs";

test("Android connected sensor remains contract-aligned", async () => {
  const result = await checkFoundation();

  assert.ok(result.kotlinFiles >= 15);
  assert.equal(result.schemaVersion, "0.1.0");
  assert.equal(result.parserStatus, "messaging-style-v0.3.0");
});
