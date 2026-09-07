import assert from "node:assert/strict";
import { it } from "node:test";
import { loadScenario, SYNTHETIC_SCENARIOS } from "@radar-rede/testkit";
import { buildRadarViewModel } from "../src/index.js";

it("builds an actionable material-shortage view with provenance", async () => {
  const model = buildRadarViewModel(await loadScenario("material-shortage"));
  assert.equal(model.overview.event_count, 5);
  assert.equal(model.overview.alert_count, 1);
  assert.equal(model.attention[0].severity, "high");
  assert.ok(model.attention[0].evidence.length > 0);
  assert.deepEqual(model.attention[0].territories.sort(), ["Bairro Novo", "Casa Caiada", "Rio Doce"]);
  assert.equal(model.attention[0].explanation.length, 3);
  assert.ok(model.territories.every((territory) => typeof territory.open_situation_count === "number"));
  assert.ok(model.conversations.every((conversation) => Array.isArray(conversation.topics)));
  assert.match(model.provenance.warning, /dados sintéticos/i);
  assert.equal(model.group_control_center.schema_version, "0.3.0");
  // O laboratório entrega o painel ligado para a coordenação validar vocabulário.
  assert.equal(model.group_control_center.enabled, true);
  // Ligar a demonstração não pode ligar a tendência: o cenário tem uma janela só.
  assert.equal(model.group_control_center.anchor.comparison_run_id, null);
  for (const grupo of model.group_control_center.groups) {
    assert.equal(grupo.trend.direction, "unavailable");
    assert.equal(grupo.capture_confidence, "unavailable");
  }
});

it("builds the same portable view-model shape for every scenario", async () => {
  for (const name of SYNTHETIC_SCENARIOS) {
    const scenario = await loadScenario(name);
    const model = buildRadarViewModel(scenario);
    assert.equal(model.schema_version, "0.1.0");
    assert.equal(model.scenario.name, name);
    assert.equal(model.overview.event_count, scenario.events.length);
    assert.equal(model.overview.territory_count, new Set(scenario.events.map((event) => event.metadata?.territory).filter(Boolean)).size);
    assert.equal(model.health.status, scenario.heartbeat.status);
    assert.ok(model.recent_events.every((event) => typeof event.id === "string"));
    assert.equal(model.group_control_center.groups.length, model.conversations.length);
  }
});
