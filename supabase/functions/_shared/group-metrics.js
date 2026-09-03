import { groupObservationKey } from "./group-resolution.js";
import { evaluateCaptureConfidence } from "./capture-health.js";

export const GROUP_METRICS_VERSION = "1.0.0";

export function buildGroupMetrics({ events, analysis, groupLinks, captureConfidence }) {
  const byGroup = new Map();
  const eventGroup = new Map();
  for (const event of events ?? []) {
    const groupId = groupLinks?.[event.event_id];
    if (!groupId) continue;
    eventGroup.set(event.event_id, groupId);
    const metric = byGroup.get(groupId) ?? emptyMetric(groupId, captureConfidence);
    metric.event_count += 1;
    byGroup.set(groupId, metric);
  }
  for (const fact of analysis?.facts ?? []) {
    const groups = groupsFor(fact.source_event_ids, eventGroup);
    for (const groupId of groups) {
      const metric = byGroup.get(groupId);
      if (!metric) continue;
      metric.fact_count += 1;
      const mentions = fact.source_event_ids.filter((id) => eventGroup.get(id) === groupId).length;
      if (fact.category === "demanda_territorial") metric.demand_count += mentions;
      if (fact.category === "agenda_mobilizacao") metric.agenda_count += mentions;
      if (fact.category === "problema_operacional") metric.problem_count += mentions;
    }
  }
  for (const alert of analysis?.alerts ?? []) {
    for (const groupId of groupsFor(alert.source_event_ids, eventGroup)) {
      const metric = byGroup.get(groupId);
      if (!metric) continue;
      metric.alert_count += 1;
      metric.open_situation_count += 1;
      if (alert.severity === "high" || alert.severity === "critical") metric.critical_situation_count += 1;
    }
  }
  return [...byGroup.values()].sort((a, b) => a.group_id.localeCompare(b.group_id));
}

export function buildEventGroupLinks(events, observationLinks) {
  return Object.fromEntries((events ?? []).flatMap((event) => {
    const key = groupObservationKey(event);
    const groupId = observationLinks?.[key];
    return groupId ? [[event.event_id, groupId]] : [];
  }));
}

export async function loadCaptureConfidence(admin, networkId, startsAt, endsAt) {
  const [healthResult, transitionResult] = await Promise.all([
    admin.from("adapter_health").select("observed_at,notification_access,listener_connected,whatsapp_installed,network_type,outbox_pending,status,recovered_at")
      .eq("network_id", networkId).order("observed_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("capture_health_transitions").select("occurred_at,kind")
      .eq("network_id", networkId).gte("occurred_at", startsAt).lte("occurred_at", endsAt)
  ]);
  if (healthResult.error || transitionResult.error) return { level: "unavailable", reason: "health_query_failed", trend_valid: false };
  return evaluateCaptureConfidence(healthResult.data, { startsAt, endsAt, transitions: transitionResult.data ?? [] });
}

export async function persistAnalysisWithMetrics(admin, payload) {
  const metricsEnabled = globalThis?.Deno?.env?.get?.("GROUP_METRICS_SHADOW_ENABLED") !== "false";
  if (!metricsEnabled) {
    const result = await admin.rpc("persist_analysis", { p_analysis: payload });
    return { ...result, metrics_persisted: false, fallback_reason: "flag_disabled" };
  }
  const result = await admin.rpc("persist_analysis_v2", { p_analysis: payload });
  if (!result.error) return { ...result, metrics_persisted: true, fallback_reason: null };
  if (!["42883", "PGRST202"].includes(result.error.code)) {
    return { ...result, metrics_persisted: false, fallback_reason: null };
  }
  const fallback = await admin.rpc("persist_analysis", { p_analysis: payload });
  return { ...fallback, metrics_persisted: false, fallback_reason: "v2_unavailable" };
}

function groupsFor(ids, eventGroup) {
  return new Set((ids ?? []).map((id) => eventGroup.get(id)).filter(Boolean));
}

function emptyMetric(groupId, captureConfidence) {
  return {
    group_id: groupId,
    event_count: 0,
    fact_count: 0,
    alert_count: 0,
    demand_count: 0,
    agenda_count: 0,
    problem_count: 0,
    open_situation_count: 0,
    critical_situation_count: 0,
    capture_confidence: captureConfidence?.level ?? "unavailable",
    metrics_version: GROUP_METRICS_VERSION
  };
}
