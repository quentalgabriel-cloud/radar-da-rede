import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { buildAnalysisPayload, validateProcessWindow } from "../_shared/analysis-payload.js";
import { analyzeEvents } from "../_shared/intelligence.js";
import { authenticateProcessor } from "../_shared/processing-auth.ts";

const MAX_EVENTS = 5_000;

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "server_not_configured" });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const principal = await authenticateProcessor(request.headers.get("authorization"), admin);
  if (!principal) return json(401, { error: "invalid_processing_credentials" });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const validation = validateProcessWindow(body);
  if (!validation.valid) return json(400, { error: validation.error });

  const window = validation.value;
  if (window.network_id !== principal.networkId) return json(403, { error: "processing_scope_mismatch" });
  const { data: events, error: eventError } = await admin
    .from("normalized_events")
    .select("event_id,schema_version,network_id,device_id,source,source_event_id,conversation_id,conversation_label,occurred_at,captured_at,message_type,text,sender_ref,reply_to_event_id,parser_version,metadata")
    .eq("network_id", window.network_id)
    .gte("occurred_at", window.starts_at)
    .lte("occurred_at", window.ends_at)
    .order("occurred_at", { ascending: true })
    .limit(MAX_EVENTS + 1);
  if (eventError) {
    console.error("processing_event_query_failed", { code: eventError.code });
    return json(500, { error: "processing_failed" });
  }
  if ((events?.length ?? 0) > MAX_EVENTS) return json(422, { error: "window_too_large" });

  const analysis = analyzeEvents(events ?? []);
  const payload = await buildAnalysisPayload({
    networkId: window.network_id,
    startsAt: window.starts_at,
    endsAt: window.ends_at,
    events: events ?? [],
    analysis
  });
  const { data, error } = await admin.rpc("persist_analysis", { p_analysis: payload });
  if (error) {
    console.error("persist_analysis_failed", { code: error.code });
    return json(500, { error: "processing_failed" });
  }

  return json(200, Array.isArray(data) ? data[0] : data ?? {});
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
