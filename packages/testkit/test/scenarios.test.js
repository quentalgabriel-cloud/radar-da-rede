import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateScenarios } from "../scripts/generate-scenarios.mjs";
import { countConversations, loadScenario, scenarioRoot, SYNTHETIC_SCENARIOS } from "../src/index.js";

for (const name of SYNTHETIC_SCENARIOS) {
  describe(`synthetic scenario: ${name}`, () => {
    it("matches its declared metrics", async () => {
      const scenario = await loadScenario(name);
      assert.equal(scenario.events.length, scenario.ground_truth.metrics.event_count);
      assert.equal(countConversations(scenario.events), scenario.ground_truth.metrics.conversation_count);
      assert.equal(scenario.heartbeat.status, scenario.ground_truth.health?.status ?? "healthy");
      assert.equal(new Set(scenario.events.map((event) => event.event_id)).size, scenario.events.length);
    });
  });
}

it("keeps generated scenarios reproducible", async () => {
  for (const expected of generateScenarios()) {
    const actual = JSON.parse(
      await readFile(resolve(scenarioRoot, expected.name, "scenario.json"), "utf8")
    );
    assert.deepEqual(actual, expected);
  }
});

it("preserves occurred_at across an offline recovery", async () => {
  const scenario = await loadScenario("offline-recovery");
  const minimumDelay = Math.min(...scenario.events.map((event) =>
    (Date.parse(event.captured_at) - Date.parse(event.occurred_at)) / 1000
  ));

  assert.ok(minimumDelay >= scenario.ground_truth.metrics.minimum_capture_delay_seconds);
});

it("rejects path traversal as a scenario name", async () => {
  await assert.rejects(() => loadScenario("../normal-day"), /invalid scenario name/);
});
