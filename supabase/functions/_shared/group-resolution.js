import { canonicalConversationLabel } from "./canonical-conversations.js";

export function buildGroupObservations(events) {
  const observations = new Map();
  for (const event of events ?? []) {
    const source = typeof event?.source === "string" ? event.source : "";
    const sourceConversationId = typeof event?.conversation_id === "string" ? event.conversation_id.trim() : "";
    const observedLabel = canonicalConversationLabel(event?.conversation_label);
    const normalizedLabel = observedLabel.toLocaleLowerCase("pt-BR");
    const observedAt = event?.occurred_at;
    if (!source || !sourceConversationId || !observedLabel || !normalizedLabel || !Number.isFinite(Date.parse(observedAt))) {
      continue;
    }
    const key = [source, sourceConversationId, normalizedLabel].join(":");
    const current = observations.get(key);
    if (!current || Date.parse(observedAt) > Date.parse(current.observed_at)) {
      observations.set(key, {
        observation_key: key,
        source,
        source_conversation_id: sourceConversationId,
        observed_label: observedLabel,
        normalized_label: normalizedLabel,
        observed_at: new Date(observedAt).toISOString()
      });
    }
  }
  return [...observations.values()].sort((a, b) => a.observation_key.localeCompare(b.observation_key));
}

export async function resolveGroupObservationsShadow(admin, networkId, events) {
  const observations = buildGroupObservations(events);
  if (observations.length === 0) return emptySummary();

  const { data, error } = await admin.rpc("resolve_group_observations", {
    p_network_id: networkId,
    p_observations: observations
  });
  if (error) {
    const unavailable = error.code === "PGRST202" || error.code === "42883";
    console.warn("group_resolution_shadow_failed", { code: error.code, unavailable });
    return { ...emptySummary(), observed: observations.length, available: false, error_code: error.code ?? "unknown" };
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.reduce((summary, row) => {
    summary.resolved += row.resolution_status === "automatic" || row.resolution_status === "confirmed" ? 1 : 0;
    summary.ambiguous += row.resolution_status === "ambiguous" ? 1 : 0;
    summary.rejected += row.resolution_status === "rejected" ? 1 : 0;
    summary.created += row.created === true ? 1 : 0;
    return summary;
  }, { ...emptySummary(), observed: observations.length, available: true });
}

function emptySummary() {
  return { observed: 0, resolved: 0, ambiguous: 0, rejected: 0, created: 0, available: true };
}
