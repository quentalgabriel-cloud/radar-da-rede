import assert from "node:assert/strict";
import test from "node:test";
import { buildGroupControlCenter, computeMetricTrend, deriveGroupCondition } from "../../../supabase/functions/_shared/group-trends.js";

test("trend engine covers growth, stability, decline and confidence suppression", () => {
  assert.equal(computeMetricTrend(15, 10, "high").direction, "growing");
  assert.equal(computeMetricTrend(11, 10, "high").direction, "stable");
  assert.equal(computeMetricTrend(5, 10, "moderate").direction, "declining");
  assert.equal(computeMetricTrend(2, 1, "high").percent, null);
  assert.equal(computeMetricTrend(20, null, "high").direction, "unavailable");
  assert.equal(computeMetricTrend(5, 10, "low").direction, "unavailable");
  assert.equal(computeMetricTrend(5, 10, "unavailable").direction, "unavailable");
});

test("condition remains independent from trend", () => {
  assert.equal(deriveGroupCondition({}), "normal");
  assert.equal(deriveGroupCondition({ problem_count: 1 }), "watch");
  assert.equal(deriveGroupCondition({ open_situation_count: 1 }), "attention");
  assert.equal(deriveGroupCondition({ critical_situation_count: 1 }), "critical");
});

test("control center builds v0.2 summary, context and real-window sparkline", () => {
  const group = { id: "g1", current_label: "Grupo", origin: "legacy", context_type: "territory", context_label: "Norte", classification_status: "confirmed", last_seen_at: "2026-09-03T12:00:00Z" };
  const base = { group_id: "g1", starts_at: "2026-09-02T12:00:00Z", demand_count: 0, agenda_count: 0, open_situation_count: 0, critical_situation_count: 0, problem_count: 0, capture_confidence: "high" };
  const model = buildGroupControlCenter({ enabled: true, groups: [group], metrics: [
    { ...base, ends_at: "2026-09-03T12:00:00Z", event_count: 15 },
    { ...base, starts_at: "2026-09-01T12:00:00Z", ends_at: "2026-09-02T12:00:00Z", event_count: 10 }
  ] });
  assert.equal(model.schema_version, "0.2.0");
  assert.equal(model.groups[0].trend.direction, "growing");
  assert.equal(model.groups[0].sparkline.length, 2);
  assert.equal(model.contexts[0].event_count, 15);
  assert.equal(model.summary.monitored, 1);
});

test("a prior outage suppresses a seemingly valid current trend", () => {
  const group = { id: "g1", current_label: "Grupo", classification_status: "confirmed" };
  const metric = { group_id: "g1", demand_count: 0, agenda_count: 0, problem_count: 0, open_situation_count: 0, critical_situation_count: 0 };
  const model = buildGroupControlCenter({ groups: [group], metrics: [
    { ...metric, starts_at: "2026-09-02T00:00:00Z", ends_at: "2026-09-03T00:00:00Z", event_count: 20, capture_confidence: "high" },
    { ...metric, starts_at: "2026-09-01T00:00:00Z", ends_at: "2026-09-02T00:00:00Z", event_count: 10, capture_confidence: "unavailable" }
  ] });
  assert.equal(model.groups[0].trend.direction, "unavailable");
});
