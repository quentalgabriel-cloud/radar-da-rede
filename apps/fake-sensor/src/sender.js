import { loadScenario } from "@radar-rede/testkit";

const postJson = async (url, body, secret, fetchImpl) => {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`
    },
    body: JSON.stringify(body)
  });
  const responseBody = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${url}: ${responseBody}`);
  return responseBody ? JSON.parse(responseBody) : null;
};

export const sendScenario = async ({
  name,
  endpoint,
  secret,
  processingSecret,
  replay = 1,
  fetchImpl = fetch
}) => {
  if (!endpoint) throw new Error("endpoint is required");
  if (!secret) throw new Error("device secret is required");
  if (!Number.isInteger(replay) || replay < 1 || replay > 10) throw new Error("replay must be between 1 and 10");

  const scenario = await loadScenario(name);
  const baseUrl = endpoint.replace(/\/$/, "");
  const batches = [];
  for (let attempt = 0; attempt < replay; attempt += 1) {
    batches.push(await postJson(`${baseUrl}/ingest-events`, scenario.batch, secret, fetchImpl));
  }
  const heartbeat = await postJson(`${baseUrl}/ingest-health`, scenario.heartbeat, secret, fetchImpl);
  const processing = processingSecret
    ? await postJson(`${baseUrl}/process-window`, processWindowFor(scenario), processingSecret, fetchImpl)
    : null;
  return { scenario: name, batches, heartbeat, processing };
};

const processWindowFor = (scenario) => {
  const timestamps = scenario.events.map((event) => Date.parse(event.occurred_at));
  return {
    network_id: scenario.network_id,
    starts_at: new Date(Math.min(...timestamps)).toISOString(),
    ends_at: new Date(Math.max(...timestamps)).toISOString()
  };
};
