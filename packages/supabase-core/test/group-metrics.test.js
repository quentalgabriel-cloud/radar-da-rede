import assert from "node:assert/strict";
import test from "node:test";
import { buildGroupMetrics, buildEventGroupLinks, persistAnalysisWithMetrics } from "../../../supabase/functions/_shared/group-metrics.js";

const events = [
  { event_id: "e1", source: "whatsapp_notification", conversation_id: "c1", conversation_label: "Grupo A" },
  { event_id: "e2", source: "whatsapp_notification", conversation_id: "c1", conversation_label: "Grupo A" },
  { event_id: "e3", source: "whatsapp_notification", conversation_id: "c2", conversation_label: "Grupo B" }
];

test("metrics use resolver links and remain deterministic", () => {
  const observationLinks = {
    "whatsapp_notification:c1:grupo a": "11111111-1111-4111-8111-111111111111",
    "whatsapp_notification:c2:grupo b": "22222222-2222-4222-8222-222222222222"
  };
  const links = buildEventGroupLinks(events, observationLinks);
  const analysis = {
    facts: [{ category: "demanda_territorial", source_event_ids: ["e1", "e2"] }],
    alerts: [{ severity: "high", source_event_ids: ["e1", "e2"] }]
  };
  const first = buildGroupMetrics({ events, analysis, groupLinks: links, captureConfidence: { level: "high" } });
  const replay = buildGroupMetrics({ events, analysis, groupLinks: links, captureConfidence: { level: "high" } });
  assert.deepEqual(replay, first);
  assert.deepEqual(first[0], {
    group_id: "11111111-1111-4111-8111-111111111111",
    event_count: 2, fact_count: 1, alert_count: 1, demand_count: 2, agenda_count: 0,
    problem_count: 0, open_situation_count: 1, critical_situation_count: 1,
    capture_confidence: "high", metrics_version: "1.0.0"
  });
});

test("unresolved observations never merge into a group by label", () => {
  assert.deepEqual(buildEventGroupLinks(events, {}), {});
  assert.deepEqual(buildGroupMetrics({ events, analysis: { facts: [], alerts: [] }, groupLinks: {}, captureConfidence: null }), []);
});

test("processing falls back to v1 only when the v2 RPC is unavailable", async () => {
  const calls = [];
  const admin = { rpc: async (name) => {
    calls.push(name);
    return name === "persist_analysis_v2" ? { data: null, error: { code: "PGRST202" } } : { data: [{ processing_run_id: "run" }], error: null };
  } };
  const result = await persistAnalysisWithMetrics(admin, {});
  assert.deepEqual(calls, ["persist_analysis_v2", "persist_analysis"]);
  assert.equal(result.metrics_persisted, false);
  assert.equal(result.fallback_reason, "v2_unavailable");
});
