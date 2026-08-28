import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validBatch, validHeartbeat } from "../../contracts/test/fixtures.js";
import {
  createIngestService,
  createStaticDeviceAuthenticator,
  InMemoryRadarRepository
} from "../src/index.js";

const setup = () => {
  const repository = new InMemoryRadarRepository();
  const authenticateDevice = createStaticDeviceAuthenticator({
    deviceId: validBatch.device_id,
    networkId: validBatch.network_id,
    secret: "test-secret"
  });
  return { repository, service: createIngestService({ repository, authenticateDevice }) };
};

describe("ingest service", () => {
  it("rejects invalid device credentials", async () => {
    const { service } = setup();
    const result = await service.ingestEvents({ authorization: "Bearer wrong", body: validBatch });
    assert.equal(result.status, 401);
  });

  it("accepts a batch and makes a replay idempotent", async () => {
    const { repository, service } = setup();
    const first = await service.ingestEvents({ authorization: "Bearer test-secret", body: validBatch });
    const replay = await service.ingestEvents({ authorization: "Bearer test-secret", body: validBatch });
    assert.equal(first.status, 202);
    assert.deepEqual(first.body, { duplicate_batch: false, accepted_events: 1, duplicate_events: 0 });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.duplicate_batch, true);
    assert.equal(repository.snapshot().events.length, 1);
  });

  it("keeps the newest heartbeat", async () => {
    const { repository, service } = setup();
    const first = await service.ingestHealth({ authorization: "Bearer test-secret", body: validHeartbeat });
    const stale = await service.ingestHealth({
      authorization: "Bearer test-secret",
      body: { ...validHeartbeat, heartbeat_id: "eff969bc-2358-4662-90f3-b0dfb7bd90d5", observed_at: "2026-08-26T11:00:00.000Z" }
    });
    assert.equal(first.status, 202);
    assert.equal(stale.body.stale, true);
    assert.equal(repository.snapshot().health[0].observed_at, validHeartbeat.observed_at);
  });
});
