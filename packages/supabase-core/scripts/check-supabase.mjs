import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const sql = await readFile(resolve(repositoryRoot, "supabase/schemas/core.sql"), "utf8");
const groupRegistryMigration = await readFile(
  resolve(repositoryRoot, "supabase/migrations/20260831190000_group_registry_foundation.sql"),
  "utf8",
);
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
const captureDiagnostic = await readFile(
  resolve(repositoryRoot, "supabase/functions/capture-diagnostic/index.ts"),
  "utf8",
);
const processLatestWindow = await readFile(
  resolve(repositoryRoot, "supabase/functions/process-latest-window/index.ts"),
  "utf8",
);
const canonicalConversations = await readFile(
  resolve(repositoryRoot, "supabase/functions/_shared/canonical-conversations.js"),
  "utf8",
);
const captureHealth = await readFile(
  resolve(repositoryRoot, "supabase/functions/_shared/capture-health.js"),
  "utf8",
);
const groupResolution = await readFile(
  resolve(repositoryRoot, "supabase/functions/_shared/group-resolution.js"),
  "utf8",
);
const processingAuth = await readFile(
  resolve(repositoryRoot, "supabase/functions/_shared/processing-auth.ts"),
  "utf8",
);
const consolidationSchedule = await readFile(
  resolve(repositoryRoot, "packages/supabase-core/src/consolidation-schedule.js"),
  "utf8",
);
const consolidationRunner = await readFile(
  resolve(repositoryRoot, "packages/supabase-core/scripts/run-consolidation.mjs"),
  "utf8",
);
const consolidationWorkflow = await readFile(
  resolve(repositoryRoot, ".github/workflows/consolidate.yml"),
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
assert.match(config, /\[functions\.capture-diagnostic\][\s\S]*?verify_jwt = true/);
assert.match(config, /\[functions\.process-latest-window\][\s\S]*?verify_jwt = true/);
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
const groupRegistryMarker = "-- P0 group registry foundation for the active operation.";
assert.equal(
  sql.slice(sql.indexOf(groupRegistryMarker)).trim(),
  groupRegistryMigration.trim(),
  "group registry migration and declarative schema diverged",
);
for (const table of ["groups", "group_aliases", "group_classification_changes"]) {
  assert.ok(tables.includes(table), `missing ${table} registry table`);
  assert.match(sql, new RegExp(`create policy ${table.replace("group_classification_changes", "group_classification_changes")}`));
}
assert.match(sql, /create or replace function public\.resolve_group_observations/);
assert.match(sql, /grant execute on function public\.resolve_group_observations\(uuid, jsonb\) to service_role/);
assert.match(sql, /create or replace function public\.classify_group/);
assert.match(sql, /private\.can_manage_network/);
assert.match(sql, /group_classification_changes/);
assert.doesNotMatch(sql, /grant (?:insert|update|delete)[^;]+groups[^;]+authenticated/i);

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
assert.match(radarReadModel, /capture_health_transitions/);
assert.match(captureDiagnostic, /withSupabase\(\{ auth: "user" \}/);
assert.match(captureDiagnostic, /diagnostic_tests/);
assert.match(processLatestWindow, /canonicalizeConversationEvent/);
assert.match(processLatestWindow, /persist_analysis/);
assert.match(canonicalConversations, /cumulativeCountSuffix/);
assert.match(captureHealth, /evaluateCaptureHealth/);
assert.match(captureHealth, /evaluateCaptureConfidence/);
assert.match(groupResolution, /resolve_group_observations/);
assert.match(processWindow, /resolveGroupObservationsShadow/);
assert.match(processLatestWindow, /resolveGroupObservationsShadow/);
assert.match(consolidationSchedule, /America\/Recife/);
assert.match(consolidationSchedule, /\[8, 13, 18\]/);
assert.match(consolidationSchedule, /CONSOLIDATION_WINDOW_HOURS = 24/);
assert.match(consolidationRunner, /RADAR_PROCESSING_SECRET/);
assert.match(consolidationRunner, /functions\/v1\/process-window/);
assert.match(consolidationWorkflow, /cron: "0 11,16,21 \* \* \*"/);
assert.match(consolidationWorkflow, /configured=true/);
assert.match(consolidationWorkflow, /if: steps\.configuration\.outputs\.configured == 'true'/);
assert.doesNotMatch(consolidationWorkflow, /SUPABASE_SERVICE_ROLE_KEY/);

console.log(`Supabase foundation OK: ${tables.length} RLS tables and synced contracts.`);
