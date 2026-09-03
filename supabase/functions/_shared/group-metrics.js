import { groupObservationKey } from "./group-resolution.js";
import { evaluateCaptureConfidence, evaluateCaptureCoverage } from "./capture-health.js";
import { buildGroupMetrics, GROUP_METRICS_VERSION } from "./group-analytics.js";

export { buildGroupMetrics, GROUP_METRICS_VERSION };

const MAX_CAPTURE_SAMPLES = 4_000;

export function buildEventGroupLinks(events, observationLinks) {
  return Object.fromEntries((events ?? []).flatMap((event) => {
    const key = groupObservationKey(event);
    const groupId = observationLinks?.[key];
    return groupId ? [[event.event_id, groupId]] : [];
  }));
}

/**
 * Every group the network monitors, so that a run can persist an explicit zero
 * for groups without events instead of leaving a hole a later read would fill
 * with an older window.
 */
export async function loadMonitoredGroupIds(admin, networkId) {
  const { data, error } = await admin
    .from("groups").select("id").eq("network_id", networkId).eq("status", "active");
  if (error) return { ids: [], error };
  return { ids: (data ?? []).map((group) => group.id), error: null };
}

/**
 * Capture confidence measured as observed coverage of the window.
 * Falls back to the v0.1 snapshot rule only when the append-only sample table is
 * not available yet, so a partial rollout keeps producing a defensible value.
 */
export async function loadCaptureCoverage(admin, networkId, startsAt, endsAt) {
  const [sampleResult, transitionResult] = await Promise.all([
    admin.from("capture_health_samples")
      .select("device_id,observed_at,status,outbox_pending,notification_access,listener_connected,whatsapp_installed,network_type")
      .eq("network_id", networkId)
      .gte("observed_at", new Date(Date.parse(startsAt) - 60 * 60_000).toISOString())
      .lte("observed_at", endsAt)
      .order("observed_at", { ascending: true })
      .limit(MAX_CAPTURE_SAMPLES),
    admin.from("capture_health_transitions").select("occurred_at,kind")
      .eq("network_id", networkId).gte("occurred_at", startsAt).lte("occurred_at", endsAt)
  ]);
  if (transitionResult.error) {
    return { level: "unavailable", reason: "health_query_failed", trend_valid: false, version: "unavailable" };
  }
  if (sampleResult.error) {
    const legacy = await loadLegacyCaptureConfidence(admin, networkId, startsAt, endsAt, transitionResult.data ?? []);
    return { ...legacy, version: "capture_snapshot@0.1", degraded_source: "capture_health_samples_unavailable" };
  }
  return evaluateCaptureCoverage(sampleResult.data ?? [], {
    startsAt, endsAt, transitions: transitionResult.data ?? []
  });
}

async function loadLegacyCaptureConfidence(admin, networkId, startsAt, endsAt, transitions) {
  const { data, error } = await admin
    .from("adapter_health")
    .select("observed_at,notification_access,listener_connected,whatsapp_installed,network_type,outbox_pending,status,recovered_at")
    .eq("network_id", networkId).order("observed_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return { level: "unavailable", reason: "health_query_failed", trend_valid: false };
  return evaluateCaptureConfidence(data, { startsAt, endsAt, transitions });
}

export async function persistAnalysisWithMetrics(admin, payload) {
  const metricsEnabled = globalThis?.Deno?.env?.get?.("GROUP_METRICS_SHADOW_ENABLED") !== "false";
  if (!metricsEnabled) {
    const result = await admin.rpc("persist_analysis", { p_analysis: payload });
    return { ...result, metrics_persisted: false, coverage_persisted: false, fallback_reason: "flag_disabled" };
  }
  const v3 = await admin.rpc("persist_analysis_v3", { p_analysis: payload });
  if (!v3.error) return { ...v3, metrics_persisted: true, coverage_persisted: true, fallback_reason: null };
  if (!isMissingFunction(v3.error)) {
    return { ...v3, metrics_persisted: false, coverage_persisted: false, fallback_reason: null };
  }
  const v2 = await admin.rpc("persist_analysis_v2", { p_analysis: payload });
  if (!v2.error) return { ...v2, metrics_persisted: true, coverage_persisted: false, fallback_reason: "v3_unavailable" };
  if (!isMissingFunction(v2.error)) {
    return { ...v2, metrics_persisted: false, coverage_persisted: false, fallback_reason: null };
  }
  const fallback = await admin.rpc("persist_analysis", { p_analysis: payload });
  return { ...fallback, metrics_persisted: false, coverage_persisted: false, fallback_reason: "v2_unavailable" };
}

const isMissingFunction = (error) => ["42883", "PGRST202"].includes(error?.code);
