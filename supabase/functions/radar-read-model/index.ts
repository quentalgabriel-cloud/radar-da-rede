import { withSupabase } from "npm:@supabase/server@1.4.1";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2.112.4/cors";
import { buildAnalysisPayload } from "../_shared/analysis-payload.js";
import { canonicalizeConversationEvent } from "../_shared/canonical-conversations.js";
import { resolveGroupObservationsShadow } from "../_shared/group-resolution.js";
import { analyzeEvents } from "../_shared/intelligence.js";
import { buildPersistedRadarViewModel } from "../_shared/radar-read-model.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIVE_WINDOW_MS = 24 * 60 * 60 * 1_000;
const MAX_EVENTS = 5_000;

const authenticatedHandler = withSupabase({ auth: "user" }, async (request, context) => {
  if (request.method !== "GET") return json(405, { error: "method_not_allowed" });
  const networkId = new URL(request.url).searchParams.get("network_id") ?? "";
  if (!UUID_PATTERN.test(networkId)) return json(400, { error: "invalid_network_id" });

  const { data: network, error: networkError } = await context.supabase
    .from("networks")
    .select("id,name")
    .eq("id", networkId)
    .maybeSingle();
  if (networkError) return databaseFailure("network_query_failed", networkError.code);
  if (!network) return json(404, { error: "network_not_found" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "server_not_configured" });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const processingError = await ensureLatestAnalysis(admin, networkId);
  if (processingError) return json(500, { error: processingError });

  const { data: run, error: runError } = await context.supabase
    .from("processing_runs")
    .select("id,network_id,starts_at,ends_at,pipeline_version,taxonomy_version,input_event_count,completed_at")
    .eq("network_id", networkId)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runError) return databaseFailure("run_query_failed", runError.code);
  if (!run) return json(404, { error: "processing_run_not_found" });

  const [eventResult, factResult, signalResult, alertResult, healthResult, transitionResult, diagnosticResult, groupResult, aliasResult, changeResult, registrySummaryResult, registryManageResult] = await Promise.all([
    context.supabase.from("normalized_events")
      .select("event_id,conversation_id,conversation_label,occurred_at,text,metadata")
      .eq("network_id", networkId)
      .gte("occurred_at", run.starts_at)
      .lte("occurred_at", run.ends_at)
      .order("occurred_at", { ascending: true })
      .limit(5_000),
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
      .eq("network_id", networkId).order("last_seen_at", { ascending: false }).limit(500),
    context.supabase.from("group_aliases")
      .select("id,group_id,source,observed_label,resolution_status,resolution_reason,confidence,first_seen_at,last_seen_at")
      .eq("network_id", networkId).order("last_seen_at", { ascending: false }).limit(1000),
    context.supabase.from("group_classification_changes")
      .select("id,group_id,changed_at,field_name,previous_value,new_value,change_source")
      .eq("network_id", networkId).order("changed_at", { ascending: false }).limit(1000),
    context.supabase.rpc("group_registry_summary", { p_network_id: networkId }),
    context.supabase.rpc("can_manage_group_registry", { p_network_id: networkId })
  ]);
  const failed = [eventResult, factResult, signalResult, alertResult, healthResult, transitionResult, diagnosticResult,
    groupResult, aliasResult, changeResult, registrySummaryResult, registryManageResult].find((result) => result.error);
  if (failed?.error) return databaseFailure("read_model_query_failed", failed.error.code);

  let diagnostic = diagnosticResult.data ?? null;
  if (diagnostic?.status === "waiting" && Date.parse(diagnostic.expires_at) <= Date.now()) {
    const failureStage = diagnosticFailureStage(healthResult.data);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "server_not_configured" });
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const completedAt = new Date().toISOString();
    const { data: expired, error: expiryError } = await admin.from("diagnostic_tests")
      .update({ status: "timeout", completed_at: completedAt, failure_stage: failureStage })
      .eq("id", diagnostic.id).eq("status", "waiting")
      .select("id,started_at,expires_at,completed_at,status,latency_ms,failure_stage").maybeSingle();
    if (expiryError) return databaseFailure("diagnostic_expiry_failed", expiryError.code);
    diagnostic = expired ?? { ...diagnostic, status: "timeout", completed_at: completedAt, failure_stage: failureStage };
  }

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
    group_registry: {
      summary: registrySummaryResult.data ?? {},
      can_manage: registryManageResult.data === true,
      groups: groupResult.data ?? [],
      aliases: aliasResult.data ?? [],
      changes: changeResult.data ?? []
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

function diagnosticFailureStage(health: Record<string, unknown> | null): string {
  if (!health?.observed_at || Date.parse(String(health.observed_at)) < Date.now() - 35 * 60_000) return "device";
  if (health.notification_access === false) return "notification_access";
  if (health.listener_connected === false) return "listener";
  if (health.last_whatsapp_notification_at && (!health.last_parsed_event_at
    || Date.parse(String(health.last_parsed_event_at)) < Date.parse(String(health.last_whatsapp_notification_at)))) return "parser";
  if (health.network_type === "offline" || Number(health.outbox_pending ?? 0) > 0) return "upload";
  return "unknown";
}


async function ensureLatestAnalysis(admin: ReturnType<typeof createClient>, networkId: string): Promise<string | null> {
  const { data: latestEvent, error: latestError } = await admin
    .from("normalized_events").select("event_id,occurred_at").eq("network_id", networkId)
    .order("occurred_at", { ascending: false }).limit(1).maybeSingle();
  if (latestError) return "event_query_failed";
  if (!latestEvent) return null;

  const { data: currentRun, error: runError } = await admin
    .from("processing_runs").select("ends_at").eq("network_id", networkId)
    .order("ends_at", { ascending: false }).limit(1).maybeSingle();
  if (runError) return "run_query_failed";
  if (currentRun?.ends_at && Date.parse(currentRun.ends_at) >= Date.parse(latestEvent.occurred_at)) return null;

  const startsAt = new Date(Math.max(0, Date.parse(latestEvent.occurred_at) - LIVE_WINDOW_MS)).toISOString();
  const { data: events, error: eventError } = await admin
    .from("normalized_events")
    .select("event_id,schema_version,network_id,device_id,source,source_event_id,conversation_id,conversation_label,occurred_at,captured_at,message_type,text,sender_ref,reply_to_event_id,parser_version,metadata")
    .eq("network_id", networkId).gte("occurred_at", startsAt).lte("occurred_at", latestEvent.occurred_at)
    .order("occurred_at", { ascending: true }).limit(MAX_EVENTS + 1);
  if (eventError || (events?.length ?? 0) > MAX_EVENTS) return "analysis_window_unavailable";

  await resolveGroupObservationsShadow(admin, networkId, events ?? []);
  const analysisEvents = (events ?? []).map(canonicalizeConversationEvent);
  const analysis = analyzeEvents(analysisEvents);
  const payload = await buildAnalysisPayload({ networkId, startsAt, endsAt: latestEvent.occurred_at, events: analysisEvents, analysis });
  const { error: persistError } = await admin.rpc("persist_analysis", { p_analysis: payload });
  return persistError ? "analysis_persist_failed" : null;
}
