import assert from "node:assert/strict";
import test from "node:test";
import {
  CONSOLIDATION_LOCAL_HOURS,
  CONSOLIDATION_TIME_ZONE,
  CONSOLIDATION_WINDOW_HOURS,
  canonicalConsolidationWindow
} from "../src/consolidation-schedule.js";

test("consolidation schedule is centralized in Recife", () => {
  assert.equal(CONSOLIDATION_TIME_ZONE, "America/Recife");
  assert.deepEqual(CONSOLIDATION_LOCAL_HOURS, [8, 13, 18]);
  assert.equal(CONSOLIDATION_WINDOW_HOURS, 24);
});

test("a delayed run anchors to the latest canonical Recife slot", () => {
  assert.deepEqual(canonicalConsolidationWindow(new Date("2026-08-31T16:47:00.000Z")), {
    starts_at: "2026-08-30T16:00:00.000Z",
    ends_at: "2026-08-31T16:00:00.000Z"
  });
  assert.deepEqual(canonicalConsolidationWindow(new Date("2026-08-31T14:00:00.000Z")), {
    starts_at: "2026-08-30T11:00:00.000Z",
    ends_at: "2026-08-31T11:00:00.000Z"
  });
});

test("a run before the first slot uses the previous day at 18:00", () => {
  assert.deepEqual(canonicalConsolidationWindow(new Date("2026-08-31T09:00:00.000Z")), {
    starts_at: "2026-08-29T21:00:00.000Z",
    ends_at: "2026-08-30T21:00:00.000Z"
  });
});

test("retries within the same slot produce the same window", () => {
  const first = canonicalConsolidationWindow(new Date("2026-08-31T21:01:00.000Z"));
  const retry = canonicalConsolidationWindow(new Date("2026-08-31T22:59:59.000Z"));
  assert.deepEqual(retry, first);
});
