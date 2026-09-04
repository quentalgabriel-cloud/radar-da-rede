import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_THRESHOLDS, evaluateOperationalHealth, renderOperationalHealthSummary
} from "../src/operational-health.js";

const AGORA = "2026-09-04T12:00:00.000Z";
const saudavel = {
  lastProcessingCompletedAt: "2026-09-04T11:05:00.000Z",
  lastHeartbeatAt: "2026-09-04T11:52:00.000Z",
  activeGroupCount: 152,
  metricRowsInLatestRun: 152,
  eventsAfterWindow: 7
};
const avaliar = (mudancas = {}) =>
  evaluateOperationalHealth({ ...saudavel, ...mudancas }, { now: AGORA });

test("a operação saudável não gera ruído", () => {
  const result = avaliar();
  assert.equal(result.healthy, true);
  assert.deepEqual(result.problems, []);
  assert.equal(result.observed.processing_age_minutes, 55);
});

test("consolidação atrasada aparece com o número observado e o que fazer", () => {
  const result = avaliar({ lastProcessingCompletedAt: "2026-09-04T04:00:00.000Z" });
  const problema = result.problems.find((item) => item.code === "processing_late");
  assert.ok(problema);
  assert.equal(problema.evidence.observed_minutes, 480);
  assert.match(problema.action, /Consolidate Radar/);
  assert.equal(result.healthy, false);
});

test("um vão de Doze não é confundido com aparelho parado", () => {
  // 41,4 min foi o maior intervalo real da primeira noite. Não pode alertar.
  assert.equal(avaliar({ lastHeartbeatAt: "2026-09-04T11:18:36.000Z" }).healthy, true);
  const parado = avaliar({ lastHeartbeatAt: "2026-09-04T08:00:00.000Z" });
  assert.ok(parado.problems.some((item) => item.code === "heartbeat_late"));
});

test("execução parcial é inconsistência, não silêncio de grupo", () => {
  const result = avaliar({ metricRowsInLatestRun: 140 });
  const problema = result.problems.find((item) => item.code === "incomplete_metrics");
  assert.equal(problema.evidence.missing, 12);
  assert.match(problema.summary, /140 de 152/);
});

test("captura à frente da consolidação vira aviso acionável", () => {
  const result = avaliar({ eventsAfterWindow: 250 });
  const problema = result.problems.find((item) => item.code === "consolidation_behind");
  assert.equal(problema.evidence.observed_events, 250);
  assert.match(problema.action, /atualizar/);
});

test("ausência de dado é problema declarado, nunca silêncio", () => {
  const semNada = evaluateOperationalHealth({}, { now: AGORA });
  const codigos = semNada.problems.map((item) => item.code);
  assert.ok(codigos.includes("no_processing_run"));
  assert.ok(codigos.includes("no_heartbeat"));
  assert.ok(codigos.includes("metrics_unreadable"));
  assert.equal(semNada.healthy, false);
});

test("relógio inválido não é tratado como operação saudável", () => {
  const result = evaluateOperationalHealth(saudavel, { now: "não é data" });
  assert.equal(result.healthy, false);
  assert.equal(result.problems[0].code, "invalid_clock");
});

test("os limites são ajustáveis e ficam registrados na saída", () => {
  const result = evaluateOperationalHealth(saudavel, {
    now: AGORA, thresholds: { processingLateAfterMinutes: 30 }
  });
  assert.ok(result.problems.some((item) => item.code === "processing_late"));
  assert.equal(result.thresholds.processingLateAfterMinutes, 30);
  assert.equal(result.thresholds.heartbeatLateAfterMinutes, DEFAULT_THRESHOLDS.heartbeatLateAfterMinutes);
});

test("o sumário diz o que fazer e não vaza identificador da rede", () => {
  const summary = renderOperationalHealthSummary(avaliar({ metricRowsInLatestRun: 140 }));
  assert.match(summary, /O que fazer/);
  assert.match(summary, /incomplete_metrics/);
  assert.ok(!summary.includes("d1224e68"));
  assert.match(renderOperationalHealthSummary(avaliar()), /sem problemas/);
});
