import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGroupObservations,
  resolveGroupObservationsShadow
} from "../../../supabase/functions/_shared/group-resolution.js";

const event = (overrides = {}) => ({
  source: "android_notification",
  conversation_id: "wa_original",
  conversation_label: "Grupo Esperança",
  occurred_at: "2026-08-31T18:00:00.000Z",
  ...overrides
});

test("group observations preserve source identity while normalizing cosmetic labels", () => {
  const observations = buildGroupObservations([
    event({ conversation_label: "Grupo Esperança (2 mensagens)", occurred_at: "2026-08-31T17:00:00.000Z" }),
    event({ conversation_label: "Grupo Esperança", occurred_at: "2026-08-31T18:00:00.000Z" }),
    event({ conversation_id: "wa_other", conversation_label: "Grupo Esperança" })
  ]);

  assert.equal(observations.length, 2);
  assert.equal(observations[0].normalized_label, "grupo esperança");
  assert.notEqual(observations[0].source_conversation_id, observations[1].source_conversation_id);
  assert.equal(observations.find((item) => item.source_conversation_id === "wa_original").observed_at,
    "2026-08-31T18:00:00.000Z");
});

test("shadow resolution reports outcomes without changing events", async () => {
  const input = [event()];
  const admin = {
    rpc: async (name, args) => {
      assert.equal(name, "resolve_group_observations");
      assert.equal(args.p_observations.length, 1);
      return { data: [{ resolution_status: "automatic", created: true }], error: null };
    }
  };

  const summary = await resolveGroupObservationsShadow(admin, "11111111-1111-8111-8111-111111111111", input);
  assert.deepEqual(summary, {
    observed: 1, resolved: 1, ambiguous: 0, rejected: 0, created: 1, available: true, enabled: true
  });
  assert.equal(input[0].conversation_id, "wa_original");
});

test("shadow resolution degrades safely before the migration is available", async () => {
  const admin = { rpc: async () => ({ data: null, error: { code: "PGRST202" } }) };
  const summary = await resolveGroupObservationsShadow(admin, "11111111-1111-8111-8111-111111111111", [event()]);
  assert.equal(summary.available, false);
  assert.equal(summary.observed, 1);
  assert.equal(summary.error_code, "PGRST202");
});

test("shadow resolution keeps ambiguous and rejected decisions out of resolved totals", async () => {
  const admin = { rpc: async () => ({
    data: [
      { resolution_status: "ambiguous", created: true },
      { resolution_status: "rejected", created: false }
    ], error: null
  }) };
  const summary = await resolveGroupObservationsShadow(admin, "11111111-1111-8111-8111-111111111111", [
    event(), event({ conversation_id: "wa_other" })
  ]);
  assert.equal(summary.resolved, 0);
  assert.equal(summary.ambiguous, 1);
  assert.equal(summary.rejected, 1);
});

test("shadow resolution can be disabled without calling the registry", async () => {
  const previousDeno = globalThis.Deno;
  globalThis.Deno = { env: { get: () => "false" } };
  try {
    const admin = { rpc: async () => assert.fail("disabled shadow must not call the registry") };
    const summary = await resolveGroupObservationsShadow(admin, "11111111-1111-8111-8111-111111111111", [event()]);
    assert.equal(summary.enabled, false);
    assert.equal(summary.observed, 1);
  } finally {
    if (previousDeno === undefined) delete globalThis.Deno; else globalThis.Deno = previousDeno;
  }
});
