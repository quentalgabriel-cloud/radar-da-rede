import { createServer } from "node:http";
import {
  createIngestService,
  createStaticDeviceAuthenticator,
  InMemoryRadarRepository
} from "@radar-rede/core";

const readJson = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const writeJson = (response, status, body) => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
};

export const createCoreSimulator = ({ deviceId, networkId, deviceSecret }) => {
  const repository = new InMemoryRadarRepository();
  const service = createIngestService({
    repository,
    authenticateDevice: createStaticDeviceAuthenticator({ deviceId, networkId, secret: deviceSecret })
  });

  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        return writeJson(response, 200, { status: "ok", persistence: "memory" });
      }
      if (request.method === "GET" && request.url === "/snapshot") {
        return writeJson(response, 200, repository.snapshot());
      }
      if (request.method !== "POST" || !new Set(["/ingest-events", "/ingest-health"]).has(request.url)) {
        return writeJson(response, 404, { error: "not_found" });
      }
      const input = { authorization: request.headers.authorization, body: await readJson(request) };
      const result = request.url === "/ingest-events"
        ? await service.ingestEvents(input)
        : await service.ingestHealth(input);
      return writeJson(response, result.status, result.body);
    } catch (error) {
      const code = error instanceof Error ? error.message : "internal_error";
      return writeJson(response, code === "request_too_large" ? 413 : 400, { error: code });
    }
  });
  return { server, repository };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = {
    deviceId: process.env.RADAR_DEVICE_ID,
    networkId: process.env.RADAR_NETWORK_ID,
    deviceSecret: process.env.RADAR_DEVICE_SECRET
  };
  if (Object.values(config).some((value) => !value)) {
    console.error("RADAR_DEVICE_ID, RADAR_NETWORK_ID and RADAR_DEVICE_SECRET are required");
    process.exitCode = 1;
  } else {
    const { server } = createCoreSimulator(config);
    const port = Number(process.env.PORT ?? "8787");
    server.listen(port, "127.0.0.1", () => console.log(`core simulator listening on http://127.0.0.1:${port}`));
  }
}
