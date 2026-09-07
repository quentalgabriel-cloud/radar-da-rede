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
  eventsAfterWindow: 7,
  lastCanonicalWindowEndsAt: "2026-09-04T08:00:00.000Z"
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

// --- Guardrail do registry e da entrega de slots (operational_health@2) ------

const saudavelV2 = {
  ...saudavel,
  groupsCreatedLast24h: 2,
  distinctConversationsLast24h: 2,
  canonicalWindowsLast24h: 6,
  // Slot das 08:00 concluído às 09:05 — dentro da tolerância de scheduler_stalled.
  lastCanonicalWindowEndsAt: "2026-09-04T08:00:00.000Z"
};
const avaliarV2 = (mudancas = {}) =>
  evaluateOperationalHealth({ ...saudavelV2, ...mudancas }, { now: AGORA });

test("um dia normal depois da canonicalização não gera ruído", () => {
  assert.equal(avaliarV2().healthy, true);
});

test("o registry inflando de novo derruba o job com a instrução certa", () => {
  // Reproduz a ordem de grandeza do defeito real: dezenas de grupos para uma
  // conversa só.
  const result = avaliarV2({ groupsCreatedLast24h: 47, distinctConversationsLast24h: 1 });
  const problema = result.problems.find((item) => item.code === "registry_inflating");
  assert.equal(problema.evidence.excess, 46);
  assert.match(problema.action, /canonicaliza/);
});

test("o guardrail mede crescimento, não o total herdado", () => {
  // 206 grupos ativos para 8 conversas é o estado atual, herdado, e não pode
  // manter o alerta vermelho ate a consolidacao acontecer.
  const result = avaliarV2({ activeGroupCount: 206, metricRowsInLatestRun: 206 });
  assert.equal(result.healthy, true);
});

test("uma conversa nova legítima não é confundida com inflação", () => {
  assert.equal(avaliarV2({ groupsCreatedLast24h: 5, distinctConversationsLast24h: 5 }).healthy, true);
  assert.equal(avaliarV2({ groupsCreatedLast24h: 7, distinctConversationsLast24h: 5 }).healthy, true);
  assert.equal(avaliarV2({ groupsCreatedLast24h: 8, distinctConversationsLast24h: 5 }).healthy, false);
});

test("sub-entrega do agendador aparece, mas atraso de fila não", () => {
  // Observado em 2026-09-04: duas janelas de seis. Precisa alertar.
  const subEntrega = avaliarV2({ canonicalWindowsLast24h: 2 });
  const problema = subEntrega.problems.find((item) => item.code === "scheduler_under_delivering");
  assert.equal(problema.evidence.delivered, 2);
  assert.equal(problema.evidence.expected, 6);
  assert.match(problema.action, /pg_cron/);
  // Perder uma ou duas por atraso de fila e tolerado.
  assert.equal(avaliarV2({ canonicalWindowsLast24h: 4 }).healthy, true);
});

test("o sumário mostra a entrega de slots e o crescimento do registry", () => {
  const summary = renderOperationalHealthSummary(avaliarV2({ canonicalWindowsLast24h: 2 }));
  assert.match(summary, /Janelas canônicas em 24 h \| 2 de 6/);
  assert.match(summary, /Grupos criados em 24 h/);
  assert.match(summary, /scheduler_under_delivering/);
});

// --- Agendador parado sem que os outros sinais acusem (operational_health@3) -

test("reproduz o caso real de 2026-09-05: refresh manual e reprocessamento escondem o agendador parado", () => {
  // lastProcessingCompletedAt fresco (refresh manual de um operador) e
  // canonicalWindowsLast24h alto (oito janelas antigas reprocessadas na
  // consolidação do registry) são exatamente os dois números observados em
  // produção enquanto o agendador estava parado havia ~19h. Sem o terceiro
  // sinal, isto passaria "saudável" — foi o que aconteceu de verdade.
  const resultado = avaliarV2({
    lastProcessingCompletedAt: "2026-09-04T11:52:00.000Z", // refresh manual, 8 min atrás
    canonicalWindowsLast24h: 8, // reprocessamento, não entrega nova
    lastCanonicalWindowEndsAt: "2026-09-03T12:00:00.000Z" // a janela real mais recente: quase 24h
  });
  assert.equal(resultado.healthy, false);
  const problema = resultado.problems.find((item) => item.code === "scheduler_stalled");
  assert.ok(problema, "precisa acusar o agendador parado mesmo com os outros números saudáveis");
  assert.equal(resultado.problems.find((item) => item.code === "processing_late"), undefined);
  assert.equal(resultado.problems.find((item) => item.code === "scheduler_under_delivering"), undefined);
  assert.match(problema.action, /pg_cron/);
});

test("reprocessar uma janela antiga não reinicia a idade — só uma janela nova reinicia", () => {
  // completed_at recente (reprocessado agora), mas ends_at continua o mesmo
  // valor antigo: a idade não pode zerar.
  const resultado = avaliarV2({ lastCanonicalWindowEndsAt: "2026-09-03T00:00:00.000Z" });
  assert.ok(resultado.problems.some((item) => item.code === "scheduler_stalled"));
});

test("ausência de qualquer janela canônica é problema declarado", () => {
  const resultado = evaluateOperationalHealth({}, { now: AGORA });
  assert.ok(resultado.problems.some((item) => item.code === "no_canonical_processing"));
});

test("o sumário mostra a idade da janela canônica mais recente", () => {
  const summary = renderOperationalHealthSummary(avaliarV2());
  assert.match(summary, /Janela canônica mais recente termina há/);
});
