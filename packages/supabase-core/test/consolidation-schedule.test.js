import assert from "node:assert/strict";
import test from "node:test";
import {
  CONSOLIDATION_LOCAL_HOURS,
  CONSOLIDATION_TIME_ZONE,
  CONSOLIDATION_WINDOW_HOURS,
  canonicalConsolidationWindow
} from "../src/consolidation-schedule.js";

test("consolidation schedule is centralized in Recife", () => {
  assert.equal(CONSOLIDATION_TIME_ZONE, "America/Recife");
  assert.deepEqual(CONSOLIDATION_LOCAL_HOURS, [0, 3, 8, 13, 18, 21]);
  assert.equal(CONSOLIDATION_WINDOW_HOURS, 24);
});

test("a delayed run anchors to the latest canonical Recife slot", () => {
  assert.deepEqual(canonicalConsolidationWindow(new Date("2026-08-31T16:47:00.000Z")), {
    starts_at: "2026-08-30T16:00:00.000Z",
    ends_at: "2026-08-31T16:00:00.000Z"
  });
  assert.deepEqual(canonicalConsolidationWindow(new Date("2026-08-31T14:00:00.000Z")), {
    starts_at: "2026-08-30T11:00:00.000Z",
    ends_at: "2026-08-31T11:00:00.000Z"
  });
});

// Antes dos seis slots, uma execução às 06:00 de Recife caía no slot das 18:00
// do dia anterior e entregava dado de doze horas atrás. Com o slot das 03:00 no
// meio, a mesma execução passa a ancorar três horas antes.
test("a madrugada deixou de cair no slot do dia anterior", () => {
  assert.deepEqual(canonicalConsolidationWindow(new Date("2026-08-31T09:00:00.000Z")), {
    starts_at: "2026-08-30T06:00:00.000Z",
    ends_at: "2026-08-31T06:00:00.000Z"
  });
});

test("o maior vão entre slots consecutivos é de cinco horas", () => {
  const emUtc = [...CONSOLIDATION_LOCAL_HOURS].sort((a, b) => a - b).map((hour) => (hour + 3) % 24);
  const ordenados = [...emUtc].sort((a, b) => a - b);
  const vaos = ordenados.map((hour, index) => index === 0
    ? hour + 24 - ordenados.at(-1)
    : hour - ordenados[index - 1]);
  assert.equal(Math.max(...vaos), 5);
  assert.equal(vaos.reduce((total, gap) => total + gap, 0), 24);
});

// A comparação casa cada slot com ele mesmo no dia anterior, então remover um
// horário já usado órfã as execuções existentes. Estes três vêm da operação.
test("os horários operacionais originais continuam sendo slots", () => {
  for (const hour of [8, 13, 18]) assert.ok(CONSOLIDATION_LOCAL_HOURS.includes(hour));
});

test("retries within the same slot produce the same window", () => {
  const first = canonicalConsolidationWindow(new Date("2026-08-31T21:01:00.000Z"));
  const retry = canonicalConsolidationWindow(new Date("2026-08-31T22:59:59.000Z"));
  assert.deepEqual(retry, first);
});
