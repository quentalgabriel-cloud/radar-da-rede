import { withSupabase } from "npm:@supabase/server@1.4.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2.112.4/cors";
import { buildPersistedRadarViewModel } from "../_shared/radar-read-model.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  const { data: run, error: runError } = await context.supabase
    .from("processing_runs")
    .select("id,network_id,starts_at,ends_at,pipeline_version,taxonomy_version,input_event_count,completed_at")
    .eq("network_id", networkId)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runError) return databaseFailure("run_query_failed", runError.code);
  if (!run) return json(404, { error: "processing_run_not_found" });

  const [eventResult, factResult, signalResult, alertResult, healthResult] = await Promise.all([
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
      .select("status,source,observed_at,outbox_pending,last_event_captured_at,last_upload_succeeded_at,adapter_version,parser_version")
      .eq("network_id", networkId).order("observed_at", { ascending: false }).limit(1).maybeSingle()
  ]);
  const failed = [eventResult, factResult, signalResult, alertResult, healthResult].find((result) => result.error);
  if (failed?.error) return databaseFailure("read_model_query_failed", failed.error.code);

  const model = buildPersistedRadarViewModel({
    network,
    run,
    events: eventResult.data ?? [],
    facts: factResult.data ?? [],
    signals: signalResult.data ?? [],
    alerts: alertResult.data ?? [],
    health: healthResult.data ?? null
  });
  return json(200, model);
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
