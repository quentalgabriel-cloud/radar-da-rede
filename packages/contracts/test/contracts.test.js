import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  validateHealthHeartbeat,
  validateIngestBatch,
  validateNormalizedEvent
} from "../src/index.js";
import { validBatch, validEvent, validHeartbeat } from "./fixtures.js";

describe("NormalizedEvent v0.1.0", () => {
  it("accepts a valid text event", () => assert.equal(validateNormalizedEvent(validEvent).valid, true));
  it("rejects an unknown schema version", () =>
    assert.equal(validateNormalizedEvent({ ...validEvent, schema_version: "0.2.0" }).valid, false));
  it("rejects empty text for a text message", () =>
    assert.equal(validateNormalizedEvent({ ...validEvent, text: "" }).valid, false));
  it("rejects unknown fields", () =>
    assert.equal(validateNormalizedEvent({ ...validEvent, raw_phone: "+5581999999999" }).valid, false));
});

describe("IngestBatch v0.1.0", () => {
  it("accepts a consistent batch", () => assert.equal(validateIngestBatch(validBatch).valid, true));
  it("rejects events from another device", () => {
    const result = validateIngestBatch({
      ...validBatch,
      events: [{ ...validEvent, device_id: "7f7a8031-572d-472e-9807-6e0af68dcb8b" }]
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.path === "/events/0/device_id"));
  });
});

describe("HealthHeartbeat v0.1.0", () => {
  it("accepts a valid heartbeat", () => assert.equal(validateHealthHeartbeat(validHeartbeat).valid, true));
  it("rejects a negative outbox count", () =>
    assert.equal(validateHealthHeartbeat({ ...validHeartbeat, outbox_pending: -1 }).valid, false));
  it("accepts capture diagnostics", () =>
    assert.equal(validateHealthHeartbeat({
      ...validHeartbeat,
      notification_access: true,
      listener_connected: true,
      whatsapp_installed: true,
      network_type: "wifi",
      last_whatsapp_notification_at: "2026-08-31T17:30:00.000Z",
      last_parsed_event_at: "2026-08-31T17:30:01.000Z"
    }).valid, true));
  it("rejects an unsupported network type", () =>
    assert.equal(validateHealthHeartbeat({ ...validHeartbeat, network_type: "satellite" }).valid, false));
});
