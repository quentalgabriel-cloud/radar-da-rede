import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const sql = await readFile(resolve(repositoryRoot, "supabase/schemas/core.sql"), "utf8");
const config = await readFile(resolve(repositoryRoot, "supabase/config.toml"), "utf8");
const handler = await readFile(
  resolve(repositoryRoot, "supabase/functions/_shared/handler.ts"),
  "utf8",
);
const canonicalContracts = await readFile(
  resolve(repositoryRoot, "packages/contracts/src/index.js"),
  "utf8",
);
const generatedContracts = await readFile(
  resolve(repositoryRoot, "supabase/functions/_shared/contracts.js"),
  "utf8",
);
const canonicalIntelligence = await readFile(
  resolve(repositoryRoot, "packages/intelligence/src/index.js"),
  "utf8",
);
const generatedIntelligence = await readFile(
  resolve(repositoryRoot, "supabase/functions/_shared/intelligence.js"),
  "utf8",
);
const processWindow = await readFile(
  resolve(repositoryRoot, "supabase/functions/process-window/index.ts"),
  "utf8",
);
const radarReadModel = await readFile(
  resolve(repositoryRoot, "supabase/functions/radar-read-model/index.ts"),
  "utf8",
);
const processingAuth = await readFile(
  resolve(repositoryRoot, "supabase/functions/_shared/processing-auth.ts"),
  "utf8",
);

const tables = [...sql.matchAll(/create table public\.([a-z_]+)/g)].map((match) => match[1]);
assert.ok(tables.length >= 10, "expected the MVP core tables");
for (const table of tables) {
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`));
}

assert.match(config, /\[functions\.ingest-events\][\s\S]*?verify_jwt = false/);
assert.match(config, /\[functions\.ingest-health\][\s\S]*?verify_jwt = false/);
assert.match(config, /\[functions\.process-window\][\s\S]*?verify_jwt = false/);
assert.match(config, /\[functions\.radar-read-model\][\s\S]*?verify_jwt = true/);
assert.match(handler, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(handler, /device_scope_mismatch/);
assert.match(handler, /device_source_mismatch/);
assert.match(handler, /npm:@supabase\/supabase-js@2\.112\.4/);
assert.match(sql, /on conflict \(batch_id\) do nothing/);
assert.match(sql, /on conflict \(event_id\) do nothing/);
assert.match(sql, /create or replace function public\.persist_analysis\(p_analysis jsonb\)/);
assert.match(sql, /pg_advisory_xact_lock/);
assert.match(sql, /grant execute on function public\.persist_analysis\(jsonb\) to service_role/);
assert.match(sql, /create or replace function private\.is_network_member\(target_network_id uuid\)/);
assert.doesNotMatch(sql, /function public\.is_network_member/);
assert.match(sql, /revoke all on all tables in schema public from anon, authenticated/);
assert.doesNotMatch(sql, /grant[^;]+device_credentials[^;]+authenticated/i);

const banner = "// GENERATED from packages/contracts/src/index.js — do not edit manually.\n";
assert.equal(generatedContracts, banner + canonicalContracts, "Edge contract copy is stale");
const intelligenceBanner = "// GENERATED from packages/intelligence/src/index.js — do not edit manually.\n";
assert.equal(generatedIntelligence, intelligenceBanner + canonicalIntelligence, "Edge intelligence copy is stale");
assert.match(processWindow, /authenticateProcessor/);
assert.match(processWindow, /processing_scope_mismatch/);
assert.match(processWindow, /persist_analysis/);
assert.match(processingAuth, /processing_credentials/);
assert.match(processingAuth, /crypto\.subtle\.digest\("SHA-256"/);
assert.match(radarReadModel, /@supabase\/server@1\.4\.1/);
assert.match(radarReadModel, /withSupabase\(\{ auth: "user" \}/);
assert.match(radarReadModel, /processing_runs/);

console.log(`Supabase foundation OK: ${tables.length} RLS tables and synced contracts.`);
