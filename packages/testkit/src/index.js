import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateHealthHeartbeat, validateIngestBatch } from "@radar-rede/contracts";

const SAFE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const SYNTHETIC_SCENARIOS = [
  "normal-day",
  "material-shortage",
  "event-time-change",
  "territory-spike",
  "same-topic-multiple-groups",
  "noise-heavy",
  "high-volume",
  "offline-recovery"
];

export const scenarioRoot = resolve(import.meta.dirname, "../../../fixtures/synthetic");

export const loadScenario = async (name) => {
  if (!SAFE_NAME.test(name)) throw new Error(`invalid scenario name: ${name}`);
  const path = resolve(scenarioRoot, name, "scenario.json");
  const scenario = JSON.parse(await readFile(path, "utf8"));
  const batch = {
    schema_version: scenario.schema_version,
    batch_id: scenario.batch_id,
    network_id: scenario.network_id,
    device_id: scenario.device_id,
    sent_at: scenario.sent_at,
    events: scenario.events
  };
  const batchResult = validateIngestBatch(batch);
  const healthResult = validateHealthHeartbeat(scenario.heartbeat);
  if (!batchResult.valid || !healthResult.valid) {
    throw new Error(JSON.stringify({ batch: batchResult.errors, heartbeat: healthResult.errors }, null, 2));
  }
  if (!scenario.ground_truth || !scenario.ground_truth.metrics) {
    throw new Error(`${name}: ground_truth.metrics is required`);
  }
  return { ...scenario, batch };
};

export const countConversations = (events) => new Set(events.map((event) => event.conversation_id)).size;
