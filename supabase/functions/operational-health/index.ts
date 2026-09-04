import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { canonicalConversationLabel } from "../_shared/canonical-conversations.js";
import { authenticateProcessor } from "../_shared/processing-auth.ts";

// Leitura somente. Existe para que a vigilância agendada consiga observar o
// estado operacional sem que a service role saia do runtime do Supabase e sem
// depender do mesmo caminho da consolidação — se dependesse, a falha que parasse
// o processamento silenciaria o alerta junto.
Deno.serve(async (request) => {
  if (request.method !== "GET") return json(405, { error: "method_not_allowed" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "server_not_configured" });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const principal = await authenticateProcessor(request.headers.get("authorization"), admin);
  if (!principal) return json(401, { error: "invalid_processing_credentials" });

  const networkId = new URL(request.url).searchParams.get("network_id") ?? "";
  if (networkId !== principal.networkId) return json(403, { error: "processing_scope_mismatch" });

  const { data: run, error: runError } = await admin
    .from("processing_runs")
    .select("id,ends_at,completed_at")
    .eq("network_id", networkId)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runError) return failure("run_query_failed", runError.code);

  const umDiaAtras = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const [heartbeat, groups, metrics, pending, gruposNovos, janelas, conversas] = await Promise.all([
    admin.from("adapter_health").select("observed_at")
      .eq("network_id", networkId).order("observed_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("groups").select("id", { count: "exact", head: true })
      .eq("network_id", networkId).eq("status", "active"),
    run
      ? admin.from("group_metric_windows").select("group_id", { count: "exact", head: true })
        .eq("processing_run_id", run.id)
      : Promise.resolve({ count: 0, error: null }),
    run
      ? admin.from("normalized_events").select("event_id", { count: "exact", head: true })
        .eq("network_id", networkId).gt("occurred_at", run.ends_at)
      : Promise.resolve({ count: 0, error: null }),
    // status=active: a consolidação de registry arquiva grupo sem apagar, e o
    // created_at original permanece. Sem este filtro, toda consolidação futura
    // acende este alerta por 24h contra um problema que já foi corrigido.
    admin.from("groups").select("id", { count: "exact", head: true })
      .eq("network_id", networkId).eq("status", "active").gte("created_at", umDiaAtras),
    admin.from("processing_runs").select("ends_at")
      .eq("network_id", networkId).eq("window_kind", "canonical_slot")
      .gte("completed_at", umDiaAtras),
    // O rótulo, não o conversation_id: o id bruto é o volátil, e contá-lo faria
    // o guardrail comparar inflado contra inflado.
    admin.from("normalized_events").select("conversation_label")
      .eq("network_id", networkId).gte("occurred_at", umDiaAtras).limit(5_000)
  ]);
  const failed = [heartbeat, groups, metrics, pending, gruposNovos, janelas, conversas]
    .find((result) => result.error);
  if (failed?.error) return failure("health_query_failed", failed.error.code);

  // A resposta carrega contagens e instantes. Nunca conteúdo, rótulo de grupo
  // nem o identificador da rede, que o chamador já conhece.
  return json(200, {
    lastProcessingCompletedAt: run?.completed_at ?? null,
    lastProcessingWindowEndsAt: run?.ends_at ?? null,
    lastHeartbeatAt: heartbeat.data?.observed_at ?? null,
    activeGroupCount: groups.count ?? 0,
    metricRowsInLatestRun: metrics.count ?? 0,
    eventsAfterWindow: pending.count ?? 0,
    groupsCreatedLast24h: gruposNovos.count ?? 0,
    // Janelas distintas, não execuções: reprocessar a mesma janela não pode
    // parecer entrega de slot.
    canonicalWindowsLast24h: new Set((janelas.data ?? []).map((row) => row.ends_at)).size,
    distinctConversationsLast24h: new Set(
      (conversas.data ?? [])
        .map((row) => canonicalConversationLabel(row.conversation_label).toLocaleLowerCase("pt-BR"))
        .filter(Boolean)
    ).size
  });
});

function failure(operation: string, code: string): Response {
  console.error(operation, { code });
  return json(500, { error: "operational_health_failed" });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
