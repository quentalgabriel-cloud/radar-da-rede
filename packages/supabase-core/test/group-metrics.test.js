import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEventGroupLinks, buildGroupMetrics, loadCaptureCoverage, loadMonitoredGroupIds, persistAnalysisWithMetrics
} from "../../../supabase/functions/_shared/group-metrics.js";

const events = [
  { event_id: "e1", source: "whatsapp_notification", conversation_id: "c1", conversation_label: "Grupo A" },
  { event_id: "e2", source: "whatsapp_notification", conversation_id: "c1", conversation_label: "Grupo A" },
  { event_id: "e3", source: "whatsapp_notification", conversation_id: "c2", conversation_label: "Grupo B" }
];

const GROUP_A = "11111111-1111-4111-8111-111111111111";
const GROUP_B = "22222222-2222-4222-8222-222222222222";
const GROUP_QUIET = "33333333-3333-4333-8333-333333333333";

test("the Edge copy resolves links and persists a row for every monitored group", () => {
  const links = buildEventGroupLinks(events, {
    "whatsapp_notification:c1:grupo a": GROUP_A,
    "whatsapp_notification:c2:grupo b": GROUP_B
  });
  const rows = buildGroupMetrics({
    events,
    analysis: {
      facts: [{ category: "demanda_territorial", source_event_ids: ["e1", "e2"] }],
      alerts: [{ severity: "high", source_event_ids: ["e1", "e2"] }]
    },
    groupLinks: links,
    captureConfidence: { level: "high" },
    monitoredGroupIds: [GROUP_A, GROUP_B, GROUP_QUIET]
  });
  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row.group_id === GROUP_QUIET).event_count, 0);
  assert.equal(rows.find((row) => row.group_id === GROUP_A).critical_situation_count, 1);
});

test("unresolved observations never merge into a group by label", () => {
  assert.deepEqual(buildEventGroupLinks(events, {}), {});
});

test("only active groups are monitored", async () => {
  const filters = {};
  const admin = { from: () => ({
    select: () => ({ eq: (column, value) => {
      filters[column] = value;
      return { eq: (column2, value2) => {
        filters[column2] = value2;
        return { data: [{ id: GROUP_A }], error: null };
      } };
    } })
  }) };
  const result = await loadMonitoredGroupIds(admin, "net");
  assert.deepEqual(result.ids, [GROUP_A]);
  assert.equal(filters.status, "active");
});

test("processing prefers v3 and degrades one step at a time", async () => {
  const missing = { data: null, error: { code: "PGRST202" } };
  const ok = { data: [{ processing_run_id: "run" }], error: null };

  const full = [];
  const v3 = await persistAnalysisWithMetrics({ rpc: async (name) => { full.push(name); return ok; } }, {});
  assert.deepEqual(full, ["persist_analysis_v3"]);
  assert.equal(v3.coverage_persisted, true);

  const withoutV3 = [];
  const v2 = await persistAnalysisWithMetrics({ rpc: async (name) => {
    withoutV3.push(name);
    return name === "persist_analysis_v3" ? missing : ok;
  } }, {});
  assert.deepEqual(withoutV3, ["persist_analysis_v3", "persist_analysis_v2"]);
  assert.equal(v2.metrics_persisted, true);
  assert.equal(v2.coverage_persisted, false);
  assert.equal(v2.fallback_reason, "v3_unavailable");

  const legacyOnly = [];
  const v1 = await persistAnalysisWithMetrics({ rpc: async (name) => {
    legacyOnly.push(name);
    return name === "persist_analysis" ? ok : missing;
  } }, {});
  assert.deepEqual(legacyOnly, ["persist_analysis_v3", "persist_analysis_v2", "persist_analysis"]);
  assert.equal(v1.metrics_persisted, false);
  assert.equal(v1.fallback_reason, "v2_unavailable");
});

test("a real error is reported instead of silently downgrading the RPC", async () => {
  const calls = [];
  const result = await persistAnalysisWithMetrics({ rpc: async (name) => {
    calls.push(name);
    return { data: null, error: { code: "23514" } };
  } }, {});
  assert.deepEqual(calls, ["persist_analysis_v3"]);
  assert.equal(result.metrics_persisted, false);
  assert.equal(result.fallback_reason, null);
});

test("capture coverage falls back to the snapshot rule when samples are unavailable", async () => {
  const admin = { from: (table) => ({
    select: () => ({
      eq: () => ({
        gte: () => ({ lte: () => ({ order: () => ({ limit: () => ({ data: null, error: { code: "42P01" } }) }) }) }),
        lte: () => ({ data: [], error: null }),
        order: () => ({ limit: () => ({ maybeSingle: () => ({
          data: {
            observed_at: "2026-09-03T20:00:00.000Z", notification_access: true, listener_connected: true,
            whatsapp_installed: true, network_type: "wifi", outbox_pending: 0, status: "healthy"
          },
          error: null
        }) }) })
      })
    }),
    table
  }) };
  const result = await loadCaptureCoverage(admin, "net", "2026-09-02T21:00:00.000Z", "2026-09-03T21:00:00.000Z");
  assert.equal(result.version, "capture_snapshot@0.1");
  assert.equal(result.degraded_source, "capture_health_samples_unavailable");
});
