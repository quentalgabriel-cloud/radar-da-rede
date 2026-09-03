import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGroupControlCenter, buildGroupMetrics, computeMetricTrend, COMPARISON_POLICY,
  deriveGroupCondition, GROUP_METRICS_VERSION, selectComparisonRun, selectCurrentRun
} from "../src/index.js";

const slotRun = (id, endsAt, kind = "canonical_slot") => ({
  id,
  window_kind: kind,
  starts_at: new Date(Date.parse(endsAt) - 24 * 3_600_000).toISOString(),
  ends_at: endsAt
});

// 18:00 in America/Recife (UTC-03:00) on three consecutive days.
const RUN_TODAY = slotRun("run-today", "2026-09-03T21:00:00.000Z");
const RUN_YESTERDAY = slotRun("run-yesterday", "2026-09-02T21:00:00.000Z");
const RUN_TODAY_MIDDAY = slotRun("run-today-13", "2026-09-03T16:00:00.000Z");

const group = (id, label = `Grupo ${id}`) => ({
  id, current_label: label, origin: "current_operation", context_type: "territory",
  context_label: "Norte", classification_status: "confirmed", last_seen_at: "2026-09-03T12:00:00.000Z"
});

const metric = (runId, groupId, eventCount, extra = {}) => ({
  processing_run_id: runId, group_id: groupId, event_count: eventCount,
  fact_count: 0, alert_count: 0, demand_count: 0, agenda_count: 0, problem_count: 0,
  open_situation_count: 0, critical_situation_count: 0,
  capture_confidence: "high", metrics_version: GROUP_METRICS_VERSION, ...extra
});

test("condition remains independent from trend", () => {
  assert.equal(deriveGroupCondition({}), "normal");
  assert.equal(deriveGroupCondition({ problem_count: 1 }), "watch");
  assert.equal(deriveGroupCondition({ open_situation_count: 1 }), "attention");
  assert.equal(deriveGroupCondition({ critical_situation_count: 1 }), "critical");
});

test("trend covers growth, stability, decline and confidence suppression", () => {
  assert.equal(computeMetricTrend(15, 10, "high").direction, "growing");
  assert.equal(computeMetricTrend(11, 10, "high").direction, "stable");
  assert.equal(computeMetricTrend(5, 10, "moderate").direction, "declining");
  assert.equal(computeMetricTrend(2, 1, "high").percent, null);
  assert.equal(computeMetricTrend(5, 10, "low").direction, "unavailable");
  assert.equal(computeMetricTrend(5, 10, "low").unavailable_reason, "capture_confidence_insufficient");
  assert.equal(computeMetricTrend(20, null, "high").direction, "unavailable");
  assert.equal(computeMetricTrend(15, 10, "high").comparison_policy, COMPARISON_POLICY);
});

test("metrics emit an explicit zero row for every monitored group", () => {
  const events = [
    { event_id: "e1", conversation_id: "c1" },
    { event_id: "e2", conversation_id: "c1" }
  ];
  const rows = buildGroupMetrics({
    events,
    analysis: { facts: [{ category: "demanda_territorial", source_event_ids: ["e1", "e2"] }], alerts: [] },
    groupLinks: { e1: "g-active", e2: "g-active" },
    captureConfidence: { level: "moderate" },
    monitoredGroupIds: ["g-active", "g-quiet"]
  });
  assert.equal(rows.length, 2);
  const quiet = rows.find((row) => row.group_id === "g-quiet");
  assert.equal(quiet.event_count, 0);
  assert.equal(quiet.capture_confidence, "moderate");
  const active = rows.find((row) => row.group_id === "g-active");
  assert.equal(active.event_count, 2);
  assert.equal(active.demand_count, 2);
});

test("metrics stay deterministic across a replay of the same input", () => {
  const input = {
    events: [{ event_id: "e1", conversation_id: "c1" }],
    analysis: { facts: [], alerts: [] },
    groupLinks: { e1: "g1" },
    captureConfidence: { level: "high" },
    monitoredGroupIds: ["g1", "g2"]
  };
  assert.deepEqual(buildGroupMetrics(input), buildGroupMetrics(input));
});

test("unresolved observations never merge into a group by label", () => {
  const rows = buildGroupMetrics({
    events: [{ event_id: "e1", conversation_id: "c1" }],
    analysis: { facts: [], alerts: [] }, groupLinks: {}, captureConfidence: null, monitoredGroupIds: []
  });
  assert.deepEqual(rows, []);
});

test("the current run is the network anchor, not the newest row of each group", () => {
  const model = buildGroupControlCenter({
    groups: [group("g-active"), group("g-was-active")],
    runs: [RUN_TODAY, RUN_YESTERDAY],
    metrics: [
      metric(RUN_TODAY.id, "g-active", 12),
      metric(RUN_YESTERDAY.id, "g-active", 10),
      // The quiet group only has a row from the previous run.
      metric(RUN_YESTERDAY.id, "g-was-active", 40)
    ]
  });
  const quiet = model.groups.find((item) => item.id === "g-was-active");
  assert.equal(quiet.event_count, 0, "a past window must never be presented as the current state");
  assert.equal(quiet.metric_source, "synthesized_zero");
  assert.equal(quiet.trend.direction, "declining");
  assert.equal(quiet.trend.previous, 40);
  assert.equal(model.anchor.current_run_id, RUN_TODAY.id);
  assert.equal(model.anchor.comparison_run_id, RUN_YESTERDAY.id);
  assert.equal(model.anchor.windows_overlap, false);
});

test("a group without any history reports an unavailable trend, not growth", () => {
  const model = buildGroupControlCenter({
    groups: [group("g-new")],
    runs: [RUN_TODAY],
    metrics: [metric(RUN_TODAY.id, "g-new", 7)]
  });
  const item = model.groups[0];
  assert.equal(item.event_count, 7);
  assert.equal(item.trend.direction, "unavailable");
  assert.equal(item.trend.unavailable_reason, "no_previous_run");
  assert.equal(model.anchor.comparison_unavailable_reason, "no_previous_run");
});

test("adjacent moving windows are never used as a comparator", () => {
  const comparison = selectComparisonRun(RUN_TODAY, [RUN_TODAY, RUN_TODAY_MIDDAY]);
  assert.equal(comparison.run, null);
  assert.equal(comparison.reason, "no_run_at_previous_day_slot");
});

test("a delayed scheduler still matches the previous day slot inside the tolerance", () => {
  const delayed = slotRun("run-yesterday-late", "2026-09-02T21:18:00.000Z");
  const comparison = selectComparisonRun(RUN_TODAY, [RUN_TODAY, delayed]);
  assert.equal(comparison.run.id, delayed.id);
});

test("a comparator more than the tolerance away is refused", () => {
  const tooLate = slotRun("run-yesterday-very-late", "2026-09-02T22:05:00.000Z");
  assert.equal(selectComparisonRun(RUN_TODAY, [RUN_TODAY, tooLate]).run, null);
});

test("a manual refresh window never compares against a scheduled window", () => {
  const manual = slotRun("run-manual", "2026-09-03T19:12:00.000Z", "manual_refresh");
  const comparison = selectComparisonRun(manual, [manual, RUN_YESTERDAY, RUN_TODAY]);
  assert.equal(comparison.run, null);
  assert.equal(comparison.reason, "current_window_is_not_a_canonical_slot");
});

test("a window of a different length is not a comparable window", () => {
  const shortRun = { id: "run-short", window_kind: "canonical_slot",
    starts_at: "2026-09-02T18:00:00.000Z", ends_at: "2026-09-02T21:00:00.000Z" };
  const comparison = selectComparisonRun(RUN_TODAY, [RUN_TODAY, shortRun]);
  assert.equal(comparison.run, null);
  assert.equal(comparison.reason, "no_comparable_window");
});

test("the day rollover keeps the same slot of the previous day", () => {
  const morningToday = slotRun("m-today", "2026-09-03T11:00:00.000Z");
  const morningYesterday = slotRun("m-yesterday", "2026-09-02T11:00:00.000Z");
  const eveningYesterday = slotRun("e-yesterday", "2026-09-02T21:00:00.000Z");
  const comparison = selectComparisonRun(morningToday, [morningToday, eveningYesterday, morningYesterday]);
  assert.equal(comparison.run.id, morningYesterday.id);
});

test("a replayed run keeps a single anchor and stable output", () => {
  const metrics = [metric(RUN_TODAY.id, "g1", 5), metric(RUN_YESTERDAY.id, "g1", 5)];
  const first = buildGroupControlCenter({ groups: [group("g1")], runs: [RUN_TODAY, RUN_YESTERDAY], metrics });
  const replay = buildGroupControlCenter({
    groups: [group("g1")], runs: [RUN_YESTERDAY, RUN_TODAY], metrics: [...metrics].reverse()
  });
  assert.deepEqual(replay, first);
  assert.equal(first.consistency.consistent, true);
});

test("a partially persisted run is reported as inconsistent instead of silently filled", () => {
  const model = buildGroupControlCenter({
    groups: [group("g1"), group("g2"), group("g3")],
    runs: [RUN_TODAY],
    metrics: [metric(RUN_TODAY.id, "g1", 3)]
  });
  assert.equal(model.consistency.monitored_group_count, 3);
  assert.equal(model.consistency.persisted_metric_count, 1);
  assert.equal(model.consistency.synthesized_zero_count, 2);
  assert.equal(model.consistency.consistent, true);
  const orphan = buildGroupControlCenter({
    groups: [group("g1")],
    runs: [RUN_TODAY],
    metrics: [metric(RUN_TODAY.id, "g1", 3), metric(RUN_TODAY.id, "g-unknown", 9)]
  });
  assert.equal(orphan.consistency.unexpected_metric_group_count, 1);
  assert.equal(orphan.consistency.consistent, false);
});

test("a prior outage suppresses a seemingly valid current trend", () => {
  const model = buildGroupControlCenter({
    groups: [group("g1")],
    runs: [RUN_TODAY, RUN_YESTERDAY],
    metrics: [
      metric(RUN_TODAY.id, "g1", 20),
      metric(RUN_YESTERDAY.id, "g1", 10, { capture_confidence: "unavailable" })
    ]
  });
  assert.equal(model.groups[0].trend.direction, "unavailable");
});

test("the sparkline follows runs, so a quiet run shows zero instead of a gap", () => {
  const model = buildGroupControlCenter({
    groups: [group("g1")],
    runs: [RUN_TODAY, RUN_TODAY_MIDDAY, RUN_YESTERDAY],
    metrics: [metric(RUN_TODAY.id, "g1", 4), metric(RUN_YESTERDAY.id, "g1", 9)]
  });
  assert.deepEqual(model.groups[0].sparkline.map((point) => point.value), [9, 0, 4]);
});

test("situations are counted in the period and labelled as such", () => {
  const model = buildGroupControlCenter({
    groups: [group("g1")], runs: [RUN_TODAY],
    metrics: [metric(RUN_TODAY.id, "g1", 4, { open_situation_count: 2 })]
  });
  assert.equal(model.situation_semantics, "period_count");
  assert.equal(model.groups[0].situation_count, 2);
  assert.equal(model.groups[0].open_situation_count, 2);
  assert.equal(model.contexts[0].situation_count, 2);
});

test("without any run the control center is unavailable rather than optimistic", () => {
  const model = buildGroupControlCenter({ groups: [group("g1")], runs: [], metrics: [] });
  assert.equal(model.available, false);
  assert.equal(model.anchor.current_run_id, null);
  assert.equal(model.groups[0].event_count, 0);
  assert.equal(model.groups[0].capture_confidence, "unavailable");
  assert.equal(selectCurrentRun([]), null);
});

test("a legacy on-read window is never a comparator for a scheduled window", () => {
  const legacy = slotRun("run-legacy", "2026-09-02T20:14:11.000Z", "legacy_on_read");
  const nearLegacy = slotRun("run-legacy-near", "2026-09-02T21:00:00.000Z", "legacy_on_read");
  const comparison = selectComparisonRun(RUN_TODAY, [RUN_TODAY, legacy, nearLegacy]);
  assert.equal(comparison.run, null);
  assert.equal(comparison.reason, "no_comparable_window");
});

test("a legacy window as the current anchor is reported, not silently compared", () => {
  const legacy = slotRun("run-legacy", "2026-09-03T22:14:11.000Z", "legacy_on_read");
  const model = buildGroupControlCenter({
    groups: [group("g1")],
    runs: [legacy, RUN_TODAY, RUN_YESTERDAY],
    metrics: [metric(legacy.id, "g1", 5)]
  });
  assert.equal(model.anchor.current_run_id, legacy.id);
  assert.equal(model.anchor.comparison_unavailable_reason, "current_window_is_not_a_canonical_slot");
});
