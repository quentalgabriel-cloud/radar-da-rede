import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadScenario, SYNTHETIC_SCENARIOS } from "@radar-rede/testkit";
import { analyzeEvents, compareWithGroundTruth } from "../src/index.js";

for (const name of SYNTHETIC_SCENARIOS) {
  describe(`intelligence: ${name}`, () => {
    it("matches the scenario ground truth", async () => {
      const scenario = await loadScenario(name);
      const analysis = analyzeEvents(scenario.events);
      const comparison = compareWithGroundTruth(analysis, scenario.ground_truth);
      assert.deepEqual(comparison, { passed: true, misses: [] });
      assert.equal(analysis.window.event_count, scenario.ground_truth.metrics.event_count);
      assert.equal(analysis.window.conversation_count, scenario.ground_truth.metrics.conversation_count);
    });
  });
}

it("keeps source event references in every derived record", async () => {
  for (const name of SYNTHETIC_SCENARIOS) {
    const scenario = await loadScenario(name);
    const analysis = analyzeEvents(scenario.events);
    for (const record of [...analysis.facts, ...analysis.signals, ...analysis.alerts]) {
      assert.ok(record.source_event_ids.length > 0);
      assert.ok(record.source_event_ids.every((id) => scenario.events.some((event) => event.event_id === id)));
    }
  }
});
