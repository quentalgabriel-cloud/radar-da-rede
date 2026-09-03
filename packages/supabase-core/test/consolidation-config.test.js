import assert from "node:assert/strict";
import test from "node:test";
import { describeConsolidationConfig, REQUIRED_CONSOLIDATION_VARIABLES } from "../src/consolidation-config.js";
import { buildConsolidationReport, networkReference, renderConsolidationSummary } from "../src/consolidation-report.js";

const validEnv = () => ({
  RADAR_SUPABASE_URL: "https://pluruijhqnueayrlkthx.supabase.co",
  RADAR_NETWORK_ID: "d1224e68-c51f-4b31-a7e6-7b91f1a65357",
  RADAR_PROCESSING_SECRET: "x".repeat(48)
});

test("a complete configuration is accepted", () => {
  const report = describeConsolidationConfig(validEnv());
  assert.equal(report.configured, true);
  assert.deepEqual(report.problems, []);
});

test("every missing variable is reported instead of silently skipping the run", () => {
  const report = describeConsolidationConfig({});
  assert.equal(report.configured, false);
  assert.equal(report.problems.length, REQUIRED_CONSOLIDATION_VARIABLES.length);
  for (const name of REQUIRED_CONSOLIDATION_VARIABLES) {
    assert.ok(report.problems.some((problem) => problem.startsWith(`${name}:`)));
  }
  assert.match(report.operatorInstruction, /processing_credentials/);
});

test("malformed values are rejected before the remote call", () => {
  const blank = describeConsolidationConfig({ ...validEnv(), RADAR_SUPABASE_URL: "   " });
  assert.equal(blank.configured, false);
  const url = describeConsolidationConfig({ ...validEnv(), RADAR_SUPABASE_URL: "https://project.supabase.co/functions/v1" });
  assert.equal(url.configured, false);
  const network = describeConsolidationConfig({ ...validEnv(), RADAR_NETWORK_ID: "not-a-uuid" });
  assert.equal(network.configured, false);
  const secret = describeConsolidationConfig({ ...validEnv(), RADAR_PROCESSING_SECRET: "short" });
  assert.equal(secret.configured, false);
});

test("the job report identifies the network without exposing it", () => {
  const networkId = "d1224e68-c51f-4b31-a7e6-7b91f1a65357";
  const report = buildConsolidationReport({
    networkId,
    window: { starts_at: "2026-09-02T21:00:00.000Z", ends_at: "2026-09-03T21:00:00.000Z" },
    status: "completed",
    result: {
      processing_run_id: "7ba2c1a4-2f1f-4d0f-9a51-2b3c4d5e6f70",
      fact_count: 3, signal_count: 1, alert_count: 2,
      capture_confidence: { level: "moderate" },
      group_metrics: { persisted: true, fallback_reason: null }
    },
    durationMs: 1234
  });
  assert.equal(report.network_ref, networkReference(networkId));
  assert.equal(report.network_ref.length, 12);
  const summary = renderConsolidationSummary(report);
  assert.ok(!summary.includes(networkId));
  assert.match(summary, /\| Processing run \| 7ba2c1a4-2f1f-4d0f-9a51-2b3c4d5e6f70 \|/);
  assert.match(summary, /\| Status \| completed \|/);
  assert.match(summary, /\| Duration \(ms\) \| 1234 \|/);
});

test("a failed report keeps the reason and never invents counts", () => {
  const report = buildConsolidationReport({
    networkId: "d1224e68-c51f-4b31-a7e6-7b91f1a65357",
    window: { starts_at: "2026-09-02T21:00:00.000Z", ends_at: "2026-09-03T21:00:00.000Z" },
    status: "failed",
    error: "consolidation_failed_http_401:invalid_processing_credentials",
    durationMs: 87
  });
  assert.equal(report.processing_run_id, null);
  assert.equal(report.fact_count, null);
  assert.match(renderConsolidationSummary(report), /invalid_processing_credentials/);
});
