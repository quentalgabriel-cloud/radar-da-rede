import { withSupabase } from "npm:@supabase/server@1.4.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2.112.4/cors";
import { canonicalConversationLabel, canonicalizeConversationEvent } from "../_shared/canonical-conversations.js";
import { buildGroupControlCenter, selectComparisonRun, selectCurrentRun } from "../_shared/group-analytics.js";
import { buildPersistedRadarViewModel } from "../_shared/radar-read-model.js";
import { evaluateOperationalHealth } from "../_shared/operational-health.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EVENT_LIMIT = 5_000;
const GROUP_LIMIT = 500;
const ALIAS_LIMIT = 1_000;
const CHANGE_LIMIT = 1_000;
const RUN_LIMIT = 12;
const METRIC_LIMIT = 4_000;

// A read never triggers a consolidation. The scheduler owns processing, and a
// deliberate refresh is a separate authorized operation (process-latest-window).
const authenticatedHandler = withSupabase({ auth: "user" }, async (request, context) => {
  if (request.method !== "GET") return json(405, { error: "method_not_allowed" });
  const networkId = new URL(request.url).searchParams.get("network_id") ?? "";
  if (!UUID_PATTERN.test(networkId)) return json(400, { error: "invalid_network_id" });

  const { data: network, error: networkError } = await context.supabase
    .from("networks")
    .select("id,name,group_control_center_enabled")
    .eq("id", networkId)
    .maybeSingle();
  if (networkError) return databaseFailure("network_query_failed", networkError.code);
  if (!network) return json(404, { error: "network_not_found" });

  const { data: runRows, error: runError } = await context.supabase
    .from("processing_runs")
    .select("id,network_id,starts_at,ends_at,pipeline_version,taxonomy_version,input_event_count,completed_at,capture_confidence,capture_coverage,window_kind")
    .eq("network_id", networkId)
    .order("ends_at", { ascending: false })
    .limit(RUN_LIMIT);
  if (runError) return databaseFailure("run_query_failed", runError.code);
  const runs = runRows ?? [];
  const run = selectCurrentRun(runs);
  if (!run) return json(404, { error: "processing_run_not_found" });
  const comparison = selectComparisonRun(run, runs);
  const anchoredRunIds = runs.map((item) => item.id);

  const umDiaAtras = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const [eventResult, factResult, signalResult, alertResult, healthResult, transitionResult, diagnosticResult,
    groupResult, aliasResult, changeResult, registrySummaryResult, registryManageResult, groupMetricResult,
    pendingEventResult, groupsCreatedResult, recentConversationResult] = await Promise.all([
    context.supabase.from("normalized_events")
      .select("event_id,conversation_id,conversation_label,occurred_at,text,metadata")
      .eq("network_id", networkId)
      .gte("occurred_at", run.starts_at)
      .lte("occurred_at", run.ends_at)
      .order("occurred_at", { ascending: true })
      .limit(EVENT_LIMIT),
    context.supabase.from("facts").select("kind,summary,source_event_ids,occurred_at,payload")
      .eq("processing_run_id", run.id).order("occurred_at", { ascending: false }),
    context.supabase.from("signals").select("rules_version,kind,summary,source_event_ids,starts_at,ends_at,payload")
      .eq("processing_run_id", run.id).order("ends_at", { ascending: false }),
    context.supabase.from("alerts").select("id,rules_version,severity,kind,title,summary,source_event_ids,status,payload")
      .eq("processing_run_id", run.id).order("created_at", { ascending: false }),
    context.supabase.from("adapter_health")
      .select("status,source,observed_at,outbox_pending,oldest_pending_at,last_event_captured_at,last_whatsapp_notification_at,last_parsed_event_at,last_upload_succeeded_at,recovered_at,notification_access,listener_connected,whatsapp_installed,network_type,adapter_version,parser_version")
      .eq("network_id", networkId).order("observed_at", { ascending: false }).limit(1).maybeSingle(),
    context.supabase.from("capture_health_transitions")
      .select("id,occurred_at,kind,summary,from_status,to_status")
      .eq("network_id", networkId).order("occurred_at", { ascending: false }).limit(12),
    context.supabase.from("diagnostic_tests")
      .select("id,started_at,expires_at,completed_at,status,latency_ms,failure_stage")
      .eq("network_id", networkId).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    context.supabase.from("groups")
      .select("id,current_label,origin,context_type,context_label,municipality,territory,primary_steward_label,status,naming_status,classification_status,classification_source,classified_at,first_seen_at,last_seen_at")
      .eq("network_id", networkId).order("last_seen_at", { ascending: false }).limit(GROUP_LIMIT),
    context.supabase.from("group_aliases")
      .select("id,group_id,source,observed_label,resolution_status,resolution_reason,confidence,first_seen_at,last_seen_at")
      .eq("network_id", networkId).order("last_seen_at", { ascending: false }).limit(ALIAS_LIMIT),
    context.supabase.from("group_classification_changes")
      .select("id,group_id,changed_at,field_name,previous_value,new_value,change_source")
      .eq("network_id", networkId).order("changed_at", { ascending: false }).limit(CHANGE_LIMIT),
    context.supabase.rpc("group_registry_summary", { p_network_id: networkId }),
    context.supabase.rpc("can_manage_group_registry", { p_network_id: networkId }),
    context.supabase.from("group_metric_windows")
      .select("processing_run_id,group_id,starts_at,ends_at,event_count,fact_count,alert_count,demand_count,agenda_count,problem_count,open_situation_count,critical_situation_count,capture_confidence,metrics_version")
      .eq("network_id", networkId).in("processing_run_id", anchoredRunIds)
      .order("ends_at", { ascending: false }).limit(METRIC_LIMIT),
    context.supabase.from("normalized_events")
      .select("event_id", { count: "exact", head: true })
      .eq("network_id", networkId).gt("occurred_at", run.ends_at),
    // As duas consultas abaixo existem só para alimentar evaluateOperationalHealth
    // com o mesmo cálculo de packages/supabase-core/src/operational-health.js,
    // pela mesma sessão do usuário (RLS), sem repetir a regra em outro lugar.
    context.supabase.from("groups").select("id", { count: "exact", head: true })
      .eq("network_id", networkId).eq("status", "active").gte("created_at", umDiaAtras),
    context.supabase.from("normalized_events").select("conversation_label")
      .eq("network_id", networkId).gte("occurred_at", umDiaAtras).limit(5_000)
  ]);
  const failed = [eventResult, factResult, signalResult, alertResult, healthResult, transitionResult, diagnosticResult,
    groupResult, aliasResult, changeResult, registrySummaryResult, registryManageResult, groupMetricResult,
    pendingEventResult, groupsCreatedResult, recentConversationResult].find((result) => result.error);
  if (failed?.error) return databaseFailure("read_model_query_failed", failed.error.code);

  const diagnostic = expireDiagnosticForDisplay(diagnosticResult.data ?? null, healthResult.data ?? null);
  const monitoredGroups = (groupResult.data ?? []).filter((group) => group.status === "active");

  // A mesma vigilância que o pg_cron chama de dentro do banco (D-024), agora
  // também para quem está com a tela aberta: nenhum dos dois caminhos de
  // checagem avisa uma pessoa ativamente, então o alerta precisa aparecer
  // onde alguém já está olhando.
  const canonicalRuns = runs.filter((item) => (item.window_kind ?? "canonical_slot") === "canonical_slot");
  const operationalHealth = evaluateOperationalHealth({
    lastProcessingCompletedAt: run.completed_at,
    lastCanonicalWindowEndsAt: canonicalRuns[0]?.ends_at ?? null,
    lastHeartbeatAt: healthResult.data?.observed_at ?? null,
    activeGroupCount: monitoredGroups.length,
    metricRowsInLatestRun: (groupMetricResult.data ?? []).filter((row) => row.processing_run_id === run.id).length,
    eventsAfterWindow: pendingEventResult.count ?? 0,
    groupsCreatedLast24h: groupsCreatedResult.count ?? 0,
    canonicalWindowsLast24h: new Set(
      canonicalRuns
        .filter((item) => item.completed_at && Date.parse(item.completed_at) >= Date.parse(umDiaAtras))
        .map((item) => item.ends_at)
    ).size,
    distinctConversationsLast24h: new Set(
      (recentConversationResult.data ?? [])
        .map((row: { conversation_label: string | null }) => canonicalConversationLabel(row.conversation_label).toLocaleLowerCase("pt-BR"))
        .filter(Boolean)
    ).size
  });

  const model = buildPersistedRadarViewModel({
    network,
    run,
    events: (eventResult.data ?? []).map(canonicalizeConversationEvent),
    facts: factResult.data ?? [],
    signals: signalResult.data ?? [],
    alerts: alertResult.data ?? [],
    health: healthResult.data ?? null,
    healthTransitions: transitionResult.data ?? [],
    diagnosticTest: diagnostic
  });
  return json(200, {
    ...model,
    read_model: {
      read_only: true,
      truncated: {
        events: (eventResult.data?.length ?? 0) >= EVENT_LIMIT,
        groups: (groupResult.data?.length ?? 0) >= GROUP_LIMIT,
        aliases: (aliasResult.data?.length ?? 0) >= ALIAS_LIMIT,
        classification_changes: (changeResult.data?.length ?? 0) >= CHANGE_LIMIT,
        runs: runs.length >= RUN_LIMIT,
        group_metrics: (groupMetricResult.data?.length ?? 0) >= METRIC_LIMIT
      }
    },
    freshness: {
      current_run_id: run.id,
      window_kind: run.window_kind ?? "canonical_slot",
      window_starts_at: run.starts_at,
      window_ends_at: run.ends_at,
      completed_at: run.completed_at ?? null,
      age_seconds: run.completed_at
        ? Math.max(0, Math.round((Date.now() - Date.parse(run.completed_at)) / 1000))
        : null,
      events_after_window: pendingEventResult.count ?? 0,
      comparison_available: Boolean(comparison.run),
      comparison_unavailable_reason: comparison.run ? null : comparison.reason
    },
    group_control_center: buildGroupControlCenter({
      groups: monitoredGroups,
      metrics: groupMetricResult.data ?? [],
      runs,
      currentRunId: run.id,
      capture: run.capture_coverage ?? (run.capture_confidence ? { level: run.capture_confidence } : null),
      enabled: network.group_control_center_enabled === true
    }),
    group_registry: {
      summary: registrySummaryResult.data ?? {},
      can_manage: registryManageResult.data === true,
      groups: groupResult.data ?? [],
      aliases: aliasResult.data ?? [],
      changes: changeResult.data ?? []
    },
    operational_health: {
      healthy: operationalHealth.healthy,
      problems: operationalHealth.problems.map((item) => ({
        code: item.code,
        summary: item.summary,
        action: item.action
      }))
    }
  });
});

export default {
  fetch(request: Request) {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    return authenticatedHandler(request);
  }
};

function databaseFailure(operation: string, code: string): Response {
  console.error(operation, { code });
  return json(500, { error: "read_model_failed" });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" }
  });
}

// The read reports an expired diagnostic as expired without persisting it.
// Only capture-diagnostic and expire_capture_diagnostics change that row.
function expireDiagnosticForDisplay(
  diagnostic: Record<string, unknown> | null,
  health: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!diagnostic || diagnostic.status !== "waiting") return diagnostic;
  if (Date.parse(String(diagnostic.expires_at)) > Date.now()) return diagnostic;
  return {
    ...diagnostic,
    status: "timeout",
    completed_at: null,
    persisted: false,
    failure_stage: diagnosticFailureStage(health)
  };
}

function diagnosticFailureStage(health: Record<string, unknown> | null): string {
  if (!health?.observed_at || Date.parse(String(health.observed_at)) < Date.now() - 35 * 60_000) return "device";
  if (health.notification_access === false) return "notification_access";
  if (health.listener_connected === false) return "listener";
  if (health.last_whatsapp_notification_at && (!health.last_parsed_event_at
    || Date.parse(String(health.last_parsed_event_at)) < Date.parse(String(health.last_whatsapp_notification_at)))) return "parser";
  if (health.network_type === "offline" || Number(health.outbox_pending ?? 0) > 0) return "upload";
  return "unknown";
}
