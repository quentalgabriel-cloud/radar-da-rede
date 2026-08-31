import assert from "node:assert/strict";
import test from "node:test";
import { createRadarRefreshController } from "../public/refresh-controller.js";

test("one refresh updates the shared model and reports consolidation time", async () => {
  const model = { generated_at: "2026-08-31T16:00:00.000Z" };
  const applied = [];
  const statuses = [];
  const controller = createRadarRefreshController({
    read: async () => model,
    apply: (value) => applied.push(value),
    onStatus: (value) => statuses.push(value),
    now: () => new Date("2026-08-31T16:02:00.000Z")
  });

  assert.equal(await controller.refresh("manual"), model);
  assert.deepEqual(applied, [model]);
  assert.equal(statuses[0].state, "loading");
  assert.equal(statuses[1].state, "success");
  assert.equal(statuses[1].consolidatedAt, model.generated_at);
});

test("concurrent refreshes share the same request", async () => {
  let resolveRead;
  let reads = 0;
  const controller = createRadarRefreshController({
    read: () => {
      reads += 1;
      return new Promise((resolve) => { resolveRead = resolve; });
    },
    apply: () => {}
  });
  const first = controller.refresh("manual");
  const second = controller.refresh("automatic");
  await Promise.resolve();
  assert.equal(reads, 1);
  resolveRead({ generated_at: null });
  assert.deepEqual(await first, await second);
});

test("automatic refresh pauses while hidden and resumes only when stale", async () => {
  let visible = false;
  let clock = new Date("2026-08-31T11:00:00.000Z");
  let intervalCallback;
  let reads = 0;
  const controller = createRadarRefreshController({
    read: async () => { reads += 1; return { generated_at: clock.toISOString() }; },
    apply: () => {},
    isVisible: () => visible,
    intervalMs: 90_000,
    now: () => clock,
    setIntervalImpl: (callback) => { intervalCallback = callback; return 1; },
    clearIntervalImpl: () => {}
  });

  controller.start();
  intervalCallback();
  await Promise.resolve();
  assert.equal(reads, 0);
  visible = true;
  await controller.refreshIfStale();
  assert.equal(reads, 1);
  clock = new Date("2026-08-31T11:00:30.000Z");
  await controller.refreshIfStale();
  assert.equal(reads, 1);
  clock = new Date("2026-08-31T11:02:00.000Z");
  await controller.refreshIfStale();
  assert.equal(reads, 2);
});
