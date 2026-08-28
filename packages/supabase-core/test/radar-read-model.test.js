import assert from "node:assert/strict";
import test from "node:test";
import { analyzeEvents } from "../../intelligence/src/index.js";
import { loadScenario } from "../../testkit/src/index.js";
import { buildAnalysisPayload } from "../../../supabase/functions/_shared/analysis-payload.js";
import { buildPersistedRadarViewModel } from "../../../supabase/functions/_shared/radar-read-model.js";

test("persisted read model keeps the synthetic UI contract", async () => {
  const scenario = await loadScenario("material-shortage");
  const analysis = analyzeEvents(scenario.events);
  const payload = await buildAnalysisPayload({
    networkId: scenario.network_id,
    startsAt: analysis.window.starts_at,
    endsAt: analysis.window.ends_at,
    events: scenario.events,
    analysis
  });
  const run = {
    id: "11111111-1111-4111-8111-111111111111",
    ...payload.run,
    completed_at: scenario.sent_at
  };
  const model = buildPersistedRadarViewModel({
    network: { id: scenario.network_id, name: "Rede piloto" },
    run,
    events: scenario.events,
    facts: payload.facts.map((fact) => ({ ...fact, taxonomy_version: analysis.taxonomy_version })),
    signals: payload.signals.map((signal) => ({ ...signal, rules_version: analysis.pipeline_version })),
    alerts: payload.alerts.map((alert) => ({ ...alert, rules_version: analysis.pipeline_version, status: "open" })),
    health: scenario.heartbeat
  });

  assert.equal(model.schema_version, "0.1.0");
  assert.equal(model.scenario.synthetic, false);
  assert.equal(model.overview.event_count, scenario.events.length);
  assert.equal(model.overview.alert_count, analysis.alerts.length);
  assert.equal(model.attention[0].evidence.length > 0, true);
  assert.equal(model.attention[0].explanation.length, 3);
  assert.equal(model.overview.territory_count, 3);
  assert.equal(model.territories.length, 3);
  assert.ok(model.conversations.every((conversation) => Array.isArray(conversation.topics)));
  assert.equal(model.provenance.processing_run_id, run.id);
});
