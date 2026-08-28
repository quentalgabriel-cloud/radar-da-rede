import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { sendScenario } from "../src/sender.js";

let server;
let endpoint;
let requests;

before(async () => {
  requests = [];
  server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requests.push({
      url: request.url,
      authorization: request.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ accepted: true }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${server.address().port}`;
});

after(async () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

describe("Fake Sensor", () => {
  it("sends replay, heartbeat and an optional processing window", async () => {
    const result = await sendScenario({
      name: "normal-day",
      endpoint,
      secret: "test-secret",
      processingSecret: "processing-secret",
      replay: 2
    });
    assert.equal(result.batches.length, 2);
    assert.deepEqual(result.processing, { accepted: true });
    assert.equal(requests.length, 4);
    assert.deepEqual(requests.map((item) => item.url), [
      "/ingest-events", "/ingest-events", "/ingest-health", "/process-window"
    ]);
    assert.equal(requests[0].body.batch_id, requests[1].body.batch_id);
    assert.equal(requests[0].authorization, "Bearer test-secret");
    assert.equal(requests[3].authorization, "Bearer processing-secret");
    assert.equal(requests[3].body.network_id, requests[0].body.network_id);
  });
});
