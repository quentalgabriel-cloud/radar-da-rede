import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildRadarViewModel } from "@radar-rede/radar-view-model";
import { loadScenario, SYNTHETIC_SCENARIOS } from "@radar-rede/testkit";

const appRoot = resolve(import.meta.dirname, "..");
const publicRoot = resolve(appRoot, "public");
const outputRoot = resolve(appRoot, "dist");
const dataRoot = resolve(outputRoot, "data");

await rm(outputRoot, { recursive: true, force: true });
await cp(publicRoot, outputRoot, { recursive: true });
await mkdir(dataRoot, { recursive: true });
const liveConfig = {
  enabled: Boolean(
    process.env.RADAR_SUPABASE_URL &&
    process.env.RADAR_SUPABASE_PUBLISHABLE_KEY &&
    process.env.RADAR_NETWORK_ID
  ),
  url: process.env.RADAR_SUPABASE_URL ?? null,
  publishable_key: process.env.RADAR_SUPABASE_PUBLISHABLE_KEY ?? null,
  network_id: process.env.RADAR_NETWORK_ID ?? null
};
await writeFile(resolve(dataRoot, "runtime-config.json"), `${JSON.stringify({ schema_version: "0.1.0", live: liveConfig }, null, 2)}\n`);
const defaultName = process.env.RADAR_DEMO_SCENARIO ?? "material-shortage";
const scenarioLabels = {
  "normal-day": "Dia normal na rede",
  "material-shortage": "Falta de material em vários grupos",
  "event-time-change": "Mudança de horário",
  "territory-spike": "Aumento de demandas em um território",
  "same-topic-multiple-groups": "Mesma dúvida em vários grupos",
  "noise-heavy": "Muitas conversas, pouca urgência",
  "high-volume": "Movimento muito acima do normal",
  "offline-recovery": "Captura recuperada após interrupção"
};
const manifest = [];
for (const name of SYNTHETIC_SCENARIOS) {
  const scenario = await loadScenario(name);
  const model = buildRadarViewModel(scenario);
  const label = scenarioLabels[name];
  if (!label) throw new Error(`Missing product label for synthetic scenario: ${name}`);
  manifest.push({ name, label, description: scenario.description });
  await writeFile(resolve(dataRoot, `${name}.json`), `${JSON.stringify(model, null, 2)}\n`);
  if (name === defaultName) {
    await writeFile(resolve(dataRoot, "radar.json"), `${JSON.stringify(model, null, 2)}\n`);
  }
}
await writeFile(resolve(dataRoot, "scenarios.json"), `${JSON.stringify({ default: defaultName, scenarios: manifest }, null, 2)}\n`);
console.log(`built Radar Web with ${manifest.length} scenarios; default ${defaultName}`);
