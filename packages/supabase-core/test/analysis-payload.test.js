import assert from "node:assert/strict";
import test from "node:test";
import { analyzeEvents } from "../../intelligence/src/index.js";
import { loadScenario } from "../../testkit/src/index.js";
import {
  buildAnalysisPayload,
  validateProcessWindow
} from "../../../supabase/functions/_shared/analysis-payload.js";

test("processing window validation limits scope and duration", () => {
  assert.equal(validateProcessWindow(null).error, "invalid_payload");
  assert.equal(validateProcessWindow({ network_id: "wrong", starts_at: "x", ends_at: "y" }).error, "invalid_network_id");
  const tooLong = validateProcessWindow({
    network_id: "11111111-1111-4111-8111-111111111111",
    starts_at: "2026-08-01T00:00:00.000Z",
    ends_at: "2026-08-09T00:00:00.000Z"
  });
  assert.equal(tooLong.error, "invalid_window");
});

test("analysis payload is deterministic and keeps provenance", async () => {
  const scenario = await loadScenario("material-shortage");
  const analysis = analyzeEvents(scenario.events);
  const args = {
    networkId: scenario.network_id,
    startsAt: analysis.window.starts_at,
    endsAt: analysis.window.ends_at,
    events: scenario.events,
    analysis
  };
  const first = await buildAnalysisPayload(args);
  const replay = await buildAnalysisPayload(args);

  assert.deepEqual(replay, first);
  assert.equal(first.run.input_event_count, scenario.events.length);
  assert.match(first.run.input_hash, /^[0-9a-f]{64}$/);
  assert.ok(first.facts.length > 0);
  assert.ok(first.alerts.length > 0);
  for (const item of [...first.facts, ...first.signals, ...first.alerts]) {
    assert.match(item.id, /^[0-9a-f-]{36}$/);
    assert.ok(item.source_event_ids.length > 0);
  }
});
