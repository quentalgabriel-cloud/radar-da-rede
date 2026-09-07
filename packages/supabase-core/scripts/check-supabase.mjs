import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EDGE_GENERATED_MODULES, generatedBanner } from "../src/edge-modules.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const sql = await readFile(resolve(repositoryRoot, "supabase/schemas/core.sql"), "utf8");
const groupRegistryMigration = await readFile(
  resolve(repositoryRoot, "supabase/migrations/20260831190000_group_registry_foundation.sql"),
  "utf8",
);
const groupRegistryAdvisorIndexesMigration = await readFile(
  resolve(repositoryRoot, "supabase/migrations/20260831220000_group_registry_advisor_indexes.sql"),
  "utf8",
);
const groupRegistryExplainabilityMigration = await readFile(
  resolve(repositoryRoot, "supabase/migrations/20260831230000_group_registry_explainability.sql"),
  "utf8",
);
const groupRegistryUiAccessMigration = await readFile(
  resolve(repositoryRoot, "supabase/migrations/20260903190000_group_registry_ui_access.sql"),
  "utf8",
);
const groupMetricWindowsMigration = await readFile(
  resolve(repositoryRoot, "supabase/migrations/20260903200000_group_metric_windows.sql"),
  "utf8",
);
const captureCoverageMigration = await readFile(
  resolve(repositoryRoot, "supabase/migrations/20260903210000_capture_coverage_and_run_anchor.sql"),
  "utf8",
);
const consolidationMigration = await readFile(
  resolve(repositoryRoot, "supabase/migrations/20260904170000_group_registry_consolidation.sql"),
  "utf8",
);
const config = await readFile(resolve(repositoryRoot, "supabase/config.toml"), "utf8");
const handler = await readFile(
  resolve(repositoryRoot, "supabase/functions/_shared/handler.ts"),
  "utf8",
);
const groupAnalytics = await readFile(
  resolve(repositoryRoot, "supabase/functions/_shared/group-analytics.js"),
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
const groupMetrics = await readFile(
  resolve(repositoryRoot, "supabase/functions/_shared/group-metrics.js"),
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
const pgCronMigration = await readFile(
  resolve(repositoryRoot, "supabase/migrations/20260905160000_pg_cron_consolidation.sql"),
  "utf8",
);
const pgCronHealthMigration = await readFile(
  resolve(repositoryRoot, "supabase/migrations/20260905163000_pg_cron_health_check.sql"),
  "utf8",
);
const healthWorkflow = await readFile(
  resolve(repositoryRoot, ".github/workflows/operational-health.yml"),
  "utf8",
);
const deployWorkflow = await readFile(
  resolve(repositoryRoot, ".github/workflows/deploy-functions.yml"),
  "utf8",
);
const operationalHealth = await readFile(
  resolve(repositoryRoot, "supabase/functions/operational-health/index.ts"),
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
assert.match(config, /\[functions\.operational-health\][\s\S]*?verify_jwt = false/);
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
const normalizedText = (value) => value.replace(/\r\n/g, "\n");
const normalizedSql = (value) => normalizedText(value).trim();
assert.equal(
  normalizedSql(sql.slice(sql.indexOf(groupRegistryMarker))),
  [groupRegistryMigration, groupRegistryAdvisorIndexesMigration, groupRegistryExplainabilityMigration,
    groupRegistryUiAccessMigration, groupMetricWindowsMigration, captureCoverageMigration,
    consolidationMigration]
    .map(normalizedSql).join("\n\n"),
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
assert.ok(tables.includes("group_metric_windows"), "missing group metric windows table");
assert.match(sql, /create or replace function public\.persist_analysis_v2/);
assert.match(sql, /grant execute on function public\.persist_analysis_v2\(jsonb\) to service_role/);
assert.match(sql, /group_control_center_enabled boolean not null default false/);
assert.ok(tables.includes("capture_health_samples"), "missing append-only capture samples table");
assert.match(sql, /create or replace function public\.persist_analysis_v3/);
assert.match(sql, /grant execute on function public\.persist_analysis_v3\(jsonb\) to service_role/);
assert.match(sql, /perform private\.record_capture_health_sample\(p_heartbeat\)/);
assert.match(sql, /add column window_kind text not null default 'canonical_slot'/);
assert.match(sql, /window_kind in \('canonical_slot', 'manual_refresh', 'legacy_on_read'\)/);
assert.match(sql, /update public\.processing_runs set window_kind = 'legacy_on_read'/);
assert.match(groupAnalytics, /same_slot_previous_day@1/);
assert.match(groupAnalytics, /synthesized_zero/);

// The comparison ignores line endings: a Windows checkout materializes these
// files with CRLF, and a byte comparison would fail there while passing on the
// Linux runner. Only the content may differ, never the platform.
for (const { canonical, edge } of EDGE_GENERATED_MODULES) {
  const canonicalSource = await readFile(resolve(repositoryRoot, canonical), "utf8");
  const generated = await readFile(resolve(repositoryRoot, edge), "utf8");
  assert.equal(
    normalizedText(generated),
    normalizedText(generatedBanner(canonical) + canonicalSource),
    "Edge copy " + edge + " is stale; run pnpm --filter @radar-rede/supabase-core sync:edge",
  );
}
assert.match(processWindow, /authenticateProcessor/);
assert.match(processWindow, /processing_scope_mismatch/);
assert.match(processWindow, /persistAnalysisWithMetrics/);
assert.match(processingAuth, /processing_credentials/);
assert.match(processingAuth, /crypto\.subtle\.digest\("SHA-256"/);
assert.match(radarReadModel, /@supabase\/server@1\.4\.1/);
assert.match(radarReadModel, /withSupabase\(\{ auth: "user" \}/);
assert.match(radarReadModel, /processing_runs/);
assert.match(radarReadModel, /capture_health_transitions/);
// P1.1: reading must never process or write with the service role.
assert.doesNotMatch(radarReadModel, /SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(radarReadModel, /persistAnalysisWithMetrics/);
assert.doesNotMatch(radarReadModel, /\.update\(/);
assert.match(radarReadModel, /read_only: true/);
assert.match(radarReadModel, /selectComparisonRun/);
assert.match(processLatestWindow, /manual_refresh_not_authorized/);
assert.match(processLatestWindow, /rate_limited/);
assert.match(processLatestWindow, /window_kind = "manual_refresh"/);
// A operacao precisa ter como forcar uma janela entre os slots: o GET deixou de
// consolidar, entao a UI tem de chamar a operacao deliberada.
const radarWebProvider = await readFile(
  resolve(repositoryRoot, "apps/radar-web/public/supabase-provider.js"),
  "utf8",
);
const radarWebApp = await readFile(
  resolve(repositoryRoot, "apps/radar-web/public/app.js"),
  "utf8",
);
assert.match(radarWebProvider, /process-latest-window/);
assert.match(radarWebProvider, /refreshLatestWindow/);
assert.match(radarWebApp, /refreshLatestWindow/);
assert.match(radarWebApp, /can_manage/);
// O gate 6 exige E2E de navegador. Se o job sair do CI, o gate deixa de valer.
const ciWorkflow = await readFile(resolve(repositoryRoot, ".github/workflows/ci.yml"), "utf8");
assert.match(ciWorkflow, /e2e:/);
assert.match(ciWorkflow, /e2e:install/);
assert.match(ciWorkflow, /test:e2e/);
assert.match(captureDiagnostic, /withSupabase\(\{ auth: "user" \}/);
assert.match(captureDiagnostic, /diagnostic_tests/);
assert.match(processLatestWindow, /canonicalizeConversationEvent/);
assert.match(processLatestWindow, /persistAnalysisWithMetrics/);
assert.match(groupMetrics, /persist_analysis_v3/);
assert.match(groupMetrics, /persist_analysis_v2/);
assert.match(groupMetrics, /fallback_reason: "v2_unavailable"/);
assert.match(groupMetrics, /loadMonitoredGroupIds/);
assert.match(groupMetrics, /capture_health_samples/);
assert.match(canonicalConversations, /cumulativeCountSuffix/);
assert.match(captureHealth, /evaluateCaptureHealth/);
assert.match(captureHealth, /evaluateCaptureConfidence/);
assert.match(captureHealth, /evaluateCaptureCoverage/);
// A regra de cobertura e versionada: mudar o comportamento sem trocar a versao
// tornaria as execucoes antigas ininterpretaveis.
assert.match(captureHealth, /capture_coverage@2/);
// Salvaguarda: high nunca pode depender so da tolerancia.
assert.match(captureHealth, /configuration_not_reported/);
assert.match(groupResolution, /resolve_group_observations/);
assert.match(processWindow, /resolveGroupObservationsShadow/);
// A resolucao de grupo nao pode voltar a usar o evento bruto: o titulo carrega
// a contagem acumulada e cada notificacao viraria um grupo novo.
assert.match(processWindow, /canonicalizeConversationEvent/);
assert.ok(
  processWindow.includes("resolveGroupObservationsShadow(admin, window.network_id, canonicalEvents)"),
  "process-window precisa resolver grupo sobre eventos canonicalizados",
);
assert.ok(
  processLatestWindow.includes("resolveGroupObservationsShadow(admin, networkId, analysisEvents)"),
  "process-latest-window precisa resolver grupo sobre eventos canonicalizados",
);
// O singular do português muda o radical: "mensagem", não "mensagens".
assert.ok(
  canonicalConversations.includes("mensage(?:m|ns)"),
  "a normalização precisa remover o sufixo de contagem também no singular",
);
assert.match(processLatestWindow, /resolveGroupObservationsShadow/);
assert.match(consolidationSchedule, /America\/Recife/);
assert.match(consolidationSchedule, /\[0, 3, 8, 13, 18, 21\]/);
assert.match(consolidationSchedule, /CONSOLIDATION_WINDOW_HOURS = 24/);
assert.match(consolidationRunner, /RADAR_PROCESSING_SECRET/);
assert.match(consolidationRunner, /functions\/v1\/process-window/);
// D-024: o agendamento saiu do schedule: do GitHub Actions (medido ~19h sem
// disparar) para pg_cron dentro do Supabase. O workflow perde o schedule: e
// vira só disparo manual; a migration é a fonte de verdade do horário agora.
assert.doesNotMatch(consolidationWorkflow, /^\s*schedule:/m);
assert.match(consolidationWorkflow, /workflow_dispatch/);
assert.match(pgCronMigration, /cron\.schedule\(\s*\n?\s*'radar-consolidate',\s*\n?\s*'0 0,3,6,11,16,21 \* \* \*'/);
// Os três horários operacionais originais continuam sendo slots. Trocá-los
// quebraria a comparação com as execuções já produzidas, porque a política casa
// cada slot com ele mesmo no dia anterior.
for (const hour of ["11", "16", "21"]) {
  assert.ok(
    /'0 ([0-9,]+) \* \* \*'/.exec(pgCronMigration)?.[1].split(",").includes(hour),
    `o slot das ${hour}:00 UTC precisa continuar no cron`,
  );
}
// P1.1: a missing secret must turn the job red, never make it green and skip.
assert.match(consolidationWorkflow, /check-consolidation-config\.mjs/);
assert.doesNotMatch(consolidationWorkflow, /configured=true/);
// A credencial nunca pode ser texto literal no arquivo: precisa nascer dentro
// do banco (gen_random_bytes) e nunca sair em claro.
assert.match(pgCronMigration, /gen_random_bytes/);
assert.match(pgCronMigration, /vault\.create_secret/);
assert.match(pgCronMigration, /vault\.decrypted_secrets/);
// A checagem de saude tambem passou a ter um caminho redundante dentro do
// Supabase, pelo mesmo motivo da consolidacao: o schedule: do GitHub Actions
// ja se provou nao confiavel para este repositorio.
assert.match(pgCronHealthMigration, /radar_cron_health_check/);
assert.match(pgCronHealthMigration, /'radar-health-check'/);
assert.match(pgCronHealthMigration, /vault\.decrypted_secrets/);
assert.match(pgCronHealthMigration, /functions\/v1\/operational-health/);
// O workflow do GitHub Actions continua existindo em paralelo (assert de
// /schedule/ mais abaixo) -- nao foi substituido, so ganhou redundancia --
// porque ele falha visivelmente (X vermelho) e um cron dentro do banco nao
// tem esse sinal por natureza.
assert.doesNotMatch(consolidationWorkflow, /if: steps\./);
assert.doesNotMatch(consolidationWorkflow, /::warning::/);
assert.doesNotMatch(consolidationWorkflow, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(consolidationRunner, /GITHUB_STEP_SUMMARY/);
// A vigilancia precisa ser independente: se dependesse do mesmo caminho, a
// falha que parasse a consolidacao silenciaria o alerta junto.
assert.match(healthWorkflow, /schedule/);
assert.match(healthWorkflow, /check-operational-health.mjs/);
assert.doesNotMatch(healthWorkflow, /SUPABASE_SERVICE_ROLE_KEY/);
// A etapa 1 ficou ~15h em main, corrigida, sem valer em producao porque o
// deploy era manual. Deploy no push a main fecha esse intervalo por
// definicao; nunca implantar sem verify e a condicao que faz isso seguro.
assert.match(deployWorkflow, /paths:\s*\n\s*- "supabase\/functions\/\*\*"/);
assert.match(deployWorkflow, /pnpm verify/);
assert.match(deployWorkflow, /functions deploy/);
assert.doesNotMatch(deployWorkflow, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(operationalHealth, /authenticateProcessor/);
assert.match(operationalHealth, /processing_scope_mismatch/);
// O guardrail precisa contar conversa canonica, nao o id bruto: contar o id
// volatil faria comparar inflado contra inflado e esconderia a inflacao.
assert.match(operationalHealth, /canonicalConversationLabel/);
assert.ok(
  !operationalHealth.includes("row.conversation_id"),
  "a vigilancia nao pode contar conversa pelo id bruto",
);
// A consolidacao de registry arquiva grupo sem apagar; sem filtrar por grupo
// ativo, toda consolidacao futura reacende este alerta por 24h contra um
// problema que ja foi corrigido.
assert.match(
  operationalHealth,
  /\.from\("groups"\)\.select\("id",[\s\S]{0,80}\.eq\("network_id", networkId\)\.eq\("status", "active"\)\.gte\("created_at"/,
  "groupsCreatedLast24h precisa contar apenas grupos ativos",
);
// Leitura pura: a vigilancia nao pode alterar o estado que observa.
for (const mutation of [".insert(", ".update(", ".delete(", ".rpc("]) {
  assert.ok(!operationalHealth.includes(mutation), `a vigilância não pode chamar ${mutation}`);
}
assert.match(consolidationRunner, /process\.exitCode = 1/);

console.log(`Supabase foundation OK: ${tables.length} RLS tables and synced contracts.`);
