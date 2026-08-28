#!/usr/bin/env node
import { loadScenario } from "@radar-rede/testkit";
import { sendScenario } from "./sender.js";

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const name = valueAfter("--scenario") ?? "normal-day";
const endpoint = valueAfter("--endpoint");
const secret = valueAfter("--device-secret") ?? process.env.RADAR_DEVICE_SECRET;
const processingSecret = valueAfter("--processing-secret") ?? process.env.RADAR_PROCESSING_SECRET;
const replay = Number(valueAfter("--replay") ?? "1");

try {
  if (endpoint) {
    console.log(JSON.stringify(await sendScenario({ name, endpoint, secret, processingSecret, replay }), null, 2));
  } else {
    const scenario = await loadScenario(name);
    console.log(JSON.stringify({ batch: scenario.batch, heartbeat: scenario.heartbeat }, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
