import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { validateHealthHeartbeat, validateIngestBatch } from "./contracts.js";
import { authenticateDevice, type DevicePrincipal } from "./device-auth.ts";

type IngestKind = "events" | "health";

export async function handleIngest(request: Request, kind: IngestKind): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "server_not_configured" });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const principal = await authenticateDevice(request.headers.get("authorization"), admin);
  if (!principal) return json(401, { error: "invalid_device_credentials" });

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 6_000_000) return json(413, { error: "request_too_large" });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const validation = kind === "events"
    ? validateIngestBatch(payload)
    : validateHealthHeartbeat(payload);
  if (!validation.valid) {
    return json(400, {
      error: kind === "events" ? "invalid_ingest_batch" : "invalid_health_heartbeat",
      details: validation.errors,
    });
  }

  const denied = scopeMismatch(principal, payload as Record<string, unknown>, kind);
  if (denied) return json(403, { error: denied });

  const rpc = kind === "events" ? "ingest_event_batch" : "ingest_health_heartbeat";
  const argument = kind === "events" ? { p_batch: payload } : { p_heartbeat: payload };
  const { data, error } = await admin.rpc(rpc, argument);
  if (error) {
    console.error("ingest_rpc_failed", { rpc, code: error.code });
    return json(500, { error: "ingest_failed" });
  }

  const result = Array.isArray(data) ? data[0] : data;
  const duplicate = kind === "events" && result?.duplicate_batch === true;
  return json(duplicate ? 200 : 202, result ?? {});
}

function scopeMismatch(
  principal: DevicePrincipal,
  payload: Record<string, unknown>,
  kind: IngestKind,
): string | null {
  if (payload.device_id !== principal.deviceId || payload.network_id !== principal.networkId) {
    return "device_scope_mismatch";
  }
  if (kind === "health" && payload.source !== principal.source) return "device_source_mismatch";
  if (kind === "events") {
    const events = payload.events as Array<Record<string, unknown>>;
    if (events.some((event) => event.source !== principal.source)) return "device_source_mismatch";
  }
  return null;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

