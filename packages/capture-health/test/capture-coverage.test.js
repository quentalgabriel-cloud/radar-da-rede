import assert from "node:assert/strict";
import test from "node:test";
import { CAPTURE_COVERAGE_VERSION, evaluateCaptureCoverage } from "../src/index.js";

const STARTS_AT = "2026-09-02T21:00:00.000Z";
const ENDS_AT = "2026-09-03T21:00:00.000Z";
const WINDOW = { startsAt: STARTS_AT, endsAt: ENDS_AT };
const MINUTE = 60_000;

// The Android sensor reports every 15 minutes.
const series = ({ from = Date.parse(STARTS_AT), to = Date.parse(ENDS_AT), stepMs = 15 * MINUTE,
  deviceId = "device-a", overrides = {} } = {}) => {
  const samples = [];
  for (let at = from; at <= to; at += stepMs) {
    samples.push({
      device_id: deviceId,
      observed_at: new Date(at).toISOString(),
      status: "healthy",
      outbox_pending: 0,
      notification_access: true,
      listener_connected: true,
      whatsapp_installed: true,
      network_type: "wifi",
      ...overrides
    });
  }
  return samples;
};

test("a fully covered window with confirmed configuration reaches high", () => {
  const result = evaluateCaptureCoverage(series(), WINDOW);
  assert.equal(result.level, "high");
  assert.equal(result.reason, "capture_covered_window");
  assert.equal(result.version, CAPTURE_COVERAGE_VERSION);
  assert.equal(result.coverage_ratio, 1);
  assert.equal(result.trend_valid, true);
  assert.equal(result.device_count, 1);
});

test("a single recent heartbeat can never prove a 24 hour window", () => {
  const result = evaluateCaptureCoverage([{
    device_id: "device-a", observed_at: "2026-09-03T20:45:00.000Z", status: "healthy",
    outbox_pending: 0, notification_access: true, listener_connected: true,
    whatsapp_installed: true, network_type: "wifi"
  }], WINDOW);
  assert.equal(result.level, "low");
  assert.equal(result.reason, "no_demonstrable_continuity");
  assert.equal(result.coverage_ratio, 0);
  assert.equal(result.trend_valid, false);
});

test("no sample inside the window is unavailable, not low", () => {
  const result = evaluateCaptureCoverage([], WINDOW);
  assert.equal(result.level, "unavailable");
  assert.equal(result.reason, "no_capture_samples");
});

test("a gap at the beginning, middle or end lowers the level", () => {
  const start = Date.parse(STARTS_AT);
  const end = Date.parse(ENDS_AT);
  const sixHours = 6 * 60 * MINUTE;
  const beginning = evaluateCaptureCoverage(series({ from: start + sixHours }), WINDOW);
  assert.equal(beginning.level, "moderate");
  assert.ok(beginning.largest_gap_seconds >= sixHours / 1000);

  const middle = evaluateCaptureCoverage(
    [...series({ to: start + sixHours }), ...series({ from: start + 2 * sixHours })], WINDOW
  );
  assert.equal(middle.level, "moderate");
  assert.ok(middle.largest_gap_seconds >= sixHours / 1000);

  const ending = evaluateCaptureCoverage(series({ to: end - sixHours }), WINDOW);
  assert.equal(ending.level, "moderate");
  assert.ok(ending.largest_gap_seconds >= sixHours / 1000);
});

test("a large outage drops the window to low", () => {
  const start = Date.parse(STARTS_AT);
  const result = evaluateCaptureCoverage(series({ to: start + 6 * 60 * MINUTE }), WINDOW);
  assert.equal(result.level, "low");
  assert.equal(result.reason, "sparse_coverage");
});

test("configuration reported as disabled makes confidence unavailable", () => {
  const result = evaluateCaptureCoverage(
    series({ overrides: { notification_access: false } }), WINDOW
  );
  assert.equal(result.level, "unavailable");
  assert.equal(result.reason, "capture_not_configured");
});

test("an adapter that never reports its configuration cannot reach high", () => {
  const result = evaluateCaptureCoverage(series({
    overrides: { notification_access: null, whatsapp_installed: null, network_type: null }
  }), WINDOW);
  assert.equal(result.level, "moderate");
  assert.equal(result.reason, "configuration_not_reported");
  assert.equal(result.configuration, "unknown");
  assert.equal(result.coverage_ratio, 1);
});

test("an incident inside the window drops the level even with full coverage", () => {
  const result = evaluateCaptureCoverage(series(), {
    ...WINDOW,
    transitions: [{ occurred_at: "2026-09-03T04:00:00.000Z", kind: "listener_disconnected" }]
  });
  assert.equal(result.level, "low");
  assert.equal(result.reason, "capture_incident_in_window");
  assert.equal(result.incident_count, 1);
});

test("a transition outside the window is ignored", () => {
  const result = evaluateCaptureCoverage(series(), {
    ...WINDOW,
    transitions: [{ occurred_at: "2026-09-01T04:00:00.000Z", kind: "listener_disconnected" }]
  });
  assert.equal(result.level, "high");
  assert.equal(result.incident_count, 0);
});

test("two devices covering different halves are combined into one window", () => {
  const start = Date.parse(STARTS_AT);
  const middle = start + 12 * 60 * MINUTE;
  const result = evaluateCaptureCoverage([
    ...series({ to: middle, deviceId: "device-a" }),
    ...series({ from: middle, deviceId: "device-b" })
  ], WINDOW);
  assert.equal(result.level, "high");
  assert.equal(result.device_count, 2);
});

test("a sample before the window anchors the first minutes", () => {
  const start = Date.parse(STARTS_AT);
  const withAnchor = evaluateCaptureCoverage(series({ from: start - 15 * MINUTE }), WINDOW);
  const withoutAnchor = evaluateCaptureCoverage(series({ from: start + 20 * MINUTE }), WINDOW);
  assert.equal(withAnchor.coverage_ratio, 1);
  assert.ok(withoutAnchor.coverage_ratio < 1);
});

test("an invalid window is refused instead of guessed", () => {
  assert.equal(evaluateCaptureCoverage(series(), { startsAt: "nope", endsAt: ENDS_AT }).level, "unavailable");
  assert.equal(evaluateCaptureCoverage(series(), { startsAt: ENDS_AT, endsAt: STARTS_AT }).reason, "invalid_window");
});
