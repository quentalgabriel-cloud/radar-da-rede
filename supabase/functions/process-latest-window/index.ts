import { withSupabase } from "npm:@supabase/server@1.4.1";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2.112.4/cors";
import { buildAnalysisPayload } from "../_shared/analysis-payload.js";
import { canonicalizeConversationEvent } from "../_shared/canonical-conversations.js";
import { resolveGroupObservationsShadow } from "../_shared/group-resolution.js";
import { buildEventGroupLinks, loadCaptureCoverage, loadMonitoredGroupIds, persistAnalysisWithMetrics } from "../_shared/group-metrics.js";
import { analyzeEvents } from "../_shared/intelligence.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WINDOW_MS = 24 * 60 * 60 * 1_000;
const MAX_EVENTS = 5_000;
// A manual refresh is deliberate, not a polling mechanism.
const MIN_INTERVAL_MS = 5 * 60 * 1_000;

const authenticatedHandler = withSupabase({ auth: "user" }, async (request, context) => {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const networkId = new URL(request.url).searchParams.get("network_id") ?? "";
  if (!UUID_PATTERN.test(networkId)) return json(400, { error: "invalid_network_id" });

  // A consulta respeita RLS e prova que o usuário pertence à rede antes de o
  // cliente administrativo processar a janela correspondente.
  const { data: network, error: membershipError } = await context.supabase
    .from("networks")
    .select("id")
    .eq("id", networkId)
    .maybeSingle();
  if (membershipError) return json(500, { error: "membership_check_failed" });
  if (!network) return json(404, { error: "network_not_found" });

  // Reading is open to every member; forcing a consolidation is not.
  const { data: canManage, error: roleError } = await context.supabase
    .rpc("can_manage_group_registry", { p_network_id: networkId });
  if (roleError) return json(500, { error: "authorization_check_failed" });
  if (canManage !== true) return json(403, { error: "manual_refresh_not_authorized" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "server_not_configured" });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: latestEvent, error: latestError } = await admin
    .from("normalized_events")
    .select("event_id,occurred_at")
    .eq("network_id", networkId)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return json(500, { error: "event_query_failed" });
  if (!latestEvent) return json(200, { status: "no_events", processed: false });

  const { data: currentRun, error: currentRunError } = await admin
    .from("processing_runs")
    .select("ends_at,completed_at")
    .eq("network_id", networkId)
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (currentRunError) return json(500, { error: "run_query_failed" });
  if (currentRun?.ends_at && Date.parse(currentRun.ends_at) >= Date.parse(latestEvent.occurred_at)) {
    return json(200, { status: "up_to_date", processed: false });
  }
  if (currentRun?.completed_at && Date.now() - Date.parse(currentRun.completed_at) < MIN_INTERVAL_MS) {
    return json(429, {
      status: "rate_limited",
      processed: false,
      retry_after_seconds: Math.ceil(
        (MIN_INTERVAL_MS - (Date.now() - Date.parse(currentRun.completed_at))) / 1000
      )
    });
  }

  const startsAt = new Date(Math.max(0, Date.parse(latestEvent.occurred_at) - WINDOW_MS)).toISOString();
  const { data: events, error: eventError } = await admin
    .from("normalized_events")
    .select("event_id,schema_version,network_id,device_id,source,source_event_id,conversation_id,conversation_label,occurred_at,captured_at,message_type,text,sender_ref,reply_to_event_id,parser_version,metadata")
    .eq("network_id", networkId)
    .gte("occurred_at", startsAt)
    .lte("occurred_at", latestEvent.occurred_at)
    .order("occurred_at", { ascending: true })
    .limit(MAX_EVENTS + 1);
  if (eventError) return json(500, { error: "event_query_failed" });
  if ((events?.length ?? 0) > MAX_EVENTS) return json(422, { error: "window_too_large" });

  const endsAt = latestEvent.occurred_at;
  // Mesma canonicalização do caminho agendado: a resolução de grupo não pode
  // depender da contagem acumulada que o WhatsApp coloca no título.
  const analysisEvents = (events ?? []).map(canonicalizeConversationEvent);
  const groupResolution = await resolveGroupObservationsShadow(admin, networkId, analysisEvents);
  const captureConfidence = await loadCaptureCoverage(admin, networkId, startsAt, endsAt);
  const monitoredGroups = await loadMonitoredGroupIds(admin, networkId);
  if (monitoredGroups.error) return json(500, { error: "monitored_group_query_failed" });
  const analysis = analyzeEvents(analysisEvents);
  const payload = await buildAnalysisPayload({
    networkId,
    startsAt,
    endsAt,
    events: analysisEvents,
    analysis,
    groupLinks: buildEventGroupLinks(analysisEvents, groupResolution.links),
    captureConfidence,
    monitoredGroupIds: monitoredGroups.ids
  });
  // The window does not follow a canonical slot, so it must never be used as a
  // trend comparator for a scheduled window.
  payload.run.window_kind = "manual_refresh";
  const { data: persisted, error: persistError, metrics_persisted, coverage_persisted, fallback_reason } = await persistAnalysisWithMetrics(admin, payload);
  if (persistError) return json(500, { error: "analysis_persist_failed" });

  const result = Array.isArray(persisted) ? persisted[0] : persisted;
  return json(200, {
    status: "processed",
    processed: true,
    window: { starts_at: startsAt, ends_at: endsAt, event_count: events?.length ?? 0, window_kind: "manual_refresh" },
    group_resolution: { ...groupResolution, links: undefined },
    capture_confidence: captureConfidence,
    group_metrics: {
      persisted: metrics_persisted,
      coverage_persisted,
      fallback_reason,
      monitored_group_count: monitoredGroups.ids.length,
      metric_row_count: payload.group_metrics.length
    },
    ...result
  });
});

export default {
  fetch(request: Request) {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    return authenticatedHandler(request);
  }
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" }
  });
}
