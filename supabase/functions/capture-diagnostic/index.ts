import { withSupabase } from "npm:@supabase/server@1.4.1";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2.112.4/cors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const authenticatedHandler = withSupabase({ auth: "user" }, async (request, context) => {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const body = await request.json().catch(() => null) as { network_id?: string } | null;
  const networkId = body?.network_id ?? "";
  if (!UUID_PATTERN.test(networkId)) return json(400, { error: "invalid_network_id" });

  const { data: network, error: networkError } = await context.supabase
    .from("networks").select("id").eq("id", networkId).maybeSingle();
  if (networkError) return json(500, { error: "network_query_failed" });
  if (!network) return json(404, { error: "network_not_found" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "server_not_configured" });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  await admin.from("diagnostic_tests")
    .update({ status: "timeout", completed_at: new Date().toISOString(), failure_stage: "unknown" })
    .eq("network_id", networkId).eq("status", "waiting").lte("expires_at", new Date().toISOString());

  const { data: waiting } = await admin.from("diagnostic_tests")
    .select("id,started_at,expires_at,status")
    .eq("network_id", networkId).eq("status", "waiting").maybeSingle();
  if (waiting) return json(409, { error: "diagnostic_already_waiting", diagnostic_test: waiting });

  const { data: devices, error: deviceError } = await admin.from("source_devices")
    .select("id,source,adapter_health(observed_at)")
    .eq("network_id", networkId).eq("status", "active");
  if (deviceError) return json(500, { error: "device_query_failed" });
  const device = (devices ?? []).sort((a, b) => {
    const sourceOrder = Number(b.source === "android_notification") - Number(a.source === "android_notification");
    if (sourceOrder !== 0) return sourceOrder;
    return Date.parse(b.adapter_health?.[0]?.observed_at ?? "0") - Date.parse(a.adapter_health?.[0]?.observed_at ?? "0");
  })[0];
  if (!device) return json(409, { error: "active_device_not_found" });

  const { data: userData, error: userError } = await context.supabase.auth.getUser();
  if (userError || !userData.user) return json(401, { error: "authentication_required" });
  const { data: diagnostic, error: insertError } = await admin.from("diagnostic_tests")
    .insert({ network_id: networkId, device_id: device.id, started_by: userData.user.id })
    .select("id,started_at,expires_at,status").single();
  if (insertError) return json(500, { error: "diagnostic_start_failed" });
  return json(201, diagnostic);
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

