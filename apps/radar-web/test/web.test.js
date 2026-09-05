import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, it } from "node:test";
import { spawn } from "node:child_process";
import { createRadarWebServer } from "../src/server.mjs";
import { SYNTHETIC_SCENARIOS } from "@radar-rede/testkit";

const appRoot = resolve(import.meta.dirname, "..");
let server;
let endpoint;

before(async () => {
  await new Promise((resolveBuild, reject) => {
    const build = spawn(process.execPath, [resolve(appRoot, "scripts/build.mjs")], { stdio: "inherit" });
    build.on("exit", (code) => code === 0 ? resolveBuild() : reject(new Error(`build failed: ${code}`)));
  });
  server = createRadarWebServer();
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  endpoint = `http://127.0.0.1:${server.address().port}`;
});

after(async () => new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose())));

it("serves the Radar shell and generated view model", async () => {
  const page = await fetch(endpoint);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /<main id="main"/);
  assert.match(html, /aria-label="Navegação principal"/);
  assert.match(html, /Radar hoje/);
  assert.match(html, /data-screen="situations"/);
  assert.match(html, /data-screen="groups"/);
  assert.match(html, /id="group-registry"/);
  assert.match(html, /id="control-center"/);
  assert.match(html, /id="condition-filter"/);
  assert.match(html, /id="group-status-filter"/);
  assert.match(html, /id="origin-filter"/);
  assert.match(html, /id="context-filter"/);
  assert.match(html, /<dialog id="group-drawer"/);
  assert.match(html, />E-mail ou usuário</);
  assert.match(html, /autocomplete="username"/);
  assert.match(html, /id="refresh-status"/);
  assert.doesNotMatch(html, /Sinais prioritários|Fact confidence|Analysis Window/);
  const data = await (await fetch(`${endpoint}/data/radar.json`)).json();
  assert.equal(data.overview.event_count, 5);
  assert.equal(data.attention.length, 1);
  assert.equal(data.overview.territory_count, 3);
  assert.equal(data.territories.length, 3);
  assert.equal(data.group_control_center.schema_version, "0.2.0");
  assert.equal(data.group_control_center.enabled, false);
  const config = await (await fetch(`${endpoint}/data/runtime-config.json`)).json();
  assert.equal(config.live.enabled, false);
});

it("serves every scenario through the same view-model contract", async () => {
  const manifest = await (await fetch(`${endpoint}/data/scenarios.json`)).json();
  assert.equal(manifest.scenarios.length, SYNTHETIC_SCENARIOS.length);
  for (const scenario of manifest.scenarios) {
    assert.ok(scenario.label, `missing product label for ${scenario.name}`);
    assert.notEqual(scenario.label, scenario.name);
    assert.doesNotMatch(scenario.label, /\b(normal|material|event|territory|topic|noise|volume|offline)-/i);
  }
  for (const name of SYNTHETIC_SCENARIOS) {
    const response = await fetch(`${endpoint}/data/${name}.json`);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.schema_version, "0.1.0");
    assert.equal(data.scenario.name, name);
    assert.match(data.provenance.warning, /sintéticos/i);
  }
});

it("keeps scripts free of innerHTML values that bypass escapeHtml for external text", async () => {
  const source = await readFile(resolve(appRoot, "public/app.js"), "utf8");
  assert.match(source, /const escapeHtml/);
  assert.doesNotMatch(source, /<p>\$\{event\.text\}/);
  assert.doesNotMatch(source, /service_role|sb_secret_/i);
  assert.doesNotMatch(source, /process-window|processing_secret/i);
  assert.match(source, /classifyGroup/);
  assert.match(source, /reviewGroupAlias/);
  assert.match(source, /renderControlCenter/);
  assert.match(source, /group_control_center/);
  assert.match(source, /showModal/);
  // D-024: nem o GitHub Actions nem o pg_cron avisam alguém ativamente hoje;
  // o banner precisa aparecer mesmo em cenários sintéticos que não têm
  // operational_health, sem quebrar.
  assert.match(source, /renderOperationalHealth/);
  assert.match(source, /operational-health-banner/);
  assert.match(source, /health\.healthy \|\| health\.problems\.length === 0/);
});

it("ships one shared refresh controller without privileged processing", async () => {
  const source = await readFile(resolve(appRoot, "public/app.js"), "utf8");
  const controller = await readFile(resolve(appRoot, "public/refresh-controller.js"), "utf8");
  assert.match(source, /createRadarRefreshController/);
  assert.match(source, /document\.visibilityState === "visible"/);
  assert.match(source, /refreshIfStale/);
  assert.match(controller, /DEFAULT_REFRESH_INTERVAL_MS = 90_000/);
  assert.match(controller, /if \(inFlight\) return inFlight/);
  assert.doesNotMatch(controller, /process-window|processing_secret|service_role/i);
});

it("keeps campaign identity tokenized and separate from operational status", async () => {
  const html = await readFile(resolve(appRoot, "public/index.html"), "utf8");
  const styles = await readFile(resolve(appRoot, "public/styles.css"), "utf8");
  const theme = await readFile(resolve(appRoot, "public/campaign-theme.css"), "utf8");
  const source = await readFile(resolve(appRoot, "public/app.js"), "utf8");

  assert.match(html, /campaign-theme\.css/);
  assert.match(theme, /--brand-primary:/);
  assert.match(theme, /--brand-primary-hover:/);
  assert.match(theme, /--brand-primary-soft:/);
  assert.match(theme, /--brand-accent:/);
  assert.match(theme, /--brand-accent-soft:/);
  assert.match(styles, /--status-ok:/);
  assert.match(styles, /--status-attention:/);
  assert.match(styles, /--status-critical:/);
  assert.match(html, /class="brand-star" src="\/assets\/star\.svg"/);
  assert.doesNotMatch(source, /style\.color|#[0-9a-f]{6}/i);
  assert.match(source, /option\.textContent = scenario\.label/);
});
