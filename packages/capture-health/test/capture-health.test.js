import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateCaptureConfidence, evaluateCaptureHealth } from "../src/index.js";

const now = "2026-08-31T18:30:00.000Z";
const healthy = {
  observed_at: "2026-08-31T18:29:00.000Z",
  notification_access: true,
  listener_connected: true,
  whatsapp_installed: true,
  network_type: "wifi",
  outbox_pending: 0,
  last_whatsapp_notification_at: "2026-08-31T18:28:00.000Z",
  last_parsed_event_at: "2026-08-31T18:28:01.000Z",
  last_upload_succeeded_at: "2026-08-31T18:28:02.000Z",
  status: "healthy"
};

describe("capture health", () => {
  it("recognizes a healthy capture chain", () =>
    assert.equal(evaluateCaptureHealth(healthy, { now }).state, "NORMAL"));
  it("requires setup when notification access is disabled", () =>
    assert.equal(evaluateCaptureHealth({ ...healthy, notification_access: false }, { now }).state, "SETUP_REQUIRED"));
  it("detects an expired heartbeat", () =>
    assert.equal(evaluateCaptureHealth({ ...healthy, observed_at: "2026-08-31T17:00:00.000Z" }, { now }).state, "INTERRUPTED"));
  it("distinguishes quiet activity from a failure", () =>
    assert.equal(evaluateCaptureHealth({
      ...healthy,
      last_whatsapp_notification_at: "2026-08-31T16:00:00.000Z",
      last_parsed_event_at: "2026-08-31T16:00:01.000Z"
    }, { now }).state, "NO_RECENT_ACTIVITY"));
});

describe("capture confidence", () => {
  const window = {
    startsAt: "2026-08-31T17:00:00.000Z",
    endsAt: "2026-08-31T18:30:00.000Z"
  };

  it("recognizes a window covered by a healthy chain", () =>
    assert.deepEqual(evaluateCaptureConfidence(healthy, window), {
      level: "high", reason: "capture_covered_window", trend_valid: true
    }));
  it("invalidates trends when listener or queue is unhealthy", () => {
    assert.equal(evaluateCaptureConfidence({ ...healthy, listener_connected: false }, window).trend_valid, false);
    assert.equal(evaluateCaptureConfidence({ ...healthy, outbox_pending: 3 }, window).level, "low");
  });
  it("marks recovery as moderate and missing coverage as unavailable", () => {
    assert.equal(evaluateCaptureConfidence({ ...healthy, status: "offline_recovery" }, window).level, "moderate");
    assert.equal(evaluateCaptureConfidence({ ...healthy, observed_at: "2026-08-31T16:00:00.000Z" }, window).level, "unavailable");
  });
});
