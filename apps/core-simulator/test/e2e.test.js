import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { sendScenario } from "../../fake-sensor/src/sender.js";
import { createCoreSimulator } from "../src/server.js";

const networkId = "d1224e68-c51f-4b31-a7e6-7b91f1a65357";
const deviceId = "b9717b98-05c9-4bdf-bb3e-95ef50303b34";
let endpoint;
let server;
let repository;

before(async () => {
  ({ server, repository } = createCoreSimulator({ deviceId, networkId, deviceSecret: "test-secret" }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${server.address().port}`;
});

after(async () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

describe("synthetic spine", () => {
  it("persists one copy when the Fake Sensor replays a material-shortage batch", async () => {
    const result = await sendScenario({
      name: "material-shortage",
      endpoint,
      secret: "test-secret",
      replay: 2
    });
    const snapshot = repository.snapshot();
    assert.equal(result.batches[0].accepted_events, 5);
    assert.equal(result.batches[1].duplicate_batch, true);
    assert.equal(snapshot.batches.length, 1);
    assert.equal(snapshot.events.length, 5);
    assert.equal(snapshot.health.length, 1);
  });

  it("accepts and deduplicates the 120-event high-volume batch", async () => {
    const result = await sendScenario({
      name: "high-volume",
      endpoint,
      secret: "test-secret",
      replay: 2
    });
    const snapshot = repository.snapshot();
    assert.equal(result.batches[0].accepted_events, 120);
    assert.equal(result.batches[1].duplicate_batch, true);
    assert.equal(snapshot.batches.length, 2);
    assert.equal(snapshot.events.length, 125);
    assert.equal(snapshot.health.length, 1);
    assert.equal(snapshot.health[0].observed_at, "2026-08-27T15:10:57.000Z");
  });
});
