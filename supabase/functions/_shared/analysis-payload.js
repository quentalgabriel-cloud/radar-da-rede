const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_WINDOW_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;

const categoryLabels = {
  agenda_mobilizacao: "Agenda e mobilização",
  material_logistica: "Material e logística",
  duvida_orientacao: "Dúvidas e orientação",
  demanda_territorial: "Demanda territorial",
  problema_operacional: "Problema operacional",
  alegacao_verificar: "Alegação a verificar"
};

export function validateProcessWindow(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, error: "invalid_payload" };
  if (!UUID_PATTERN.test(value.network_id ?? "")) return { valid: false, error: "invalid_network_id" };
  const startsAt = Date.parse(value.starts_at);
  const endsAt = Date.parse(value.ends_at);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return { valid: false, error: "invalid_window" };
  if (startsAt > endsAt || endsAt - startsAt > MAX_WINDOW_MILLISECONDS) {
    return { valid: false, error: "invalid_window" };
  }
  return {
    valid: true,
    value: {
      network_id: value.network_id,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString()
    }
  };
}

export async function buildAnalysisPayload({ networkId, startsAt, endsAt, events, analysis }) {
  const inputHash = await sha256(JSON.stringify(events.map((event) => ({
    event_id: event.event_id,
    occurred_at: event.occurred_at,
    conversation_id: event.conversation_id,
    message_type: event.message_type,
    text: event.text,
    metadata: event.metadata
  }))));
  const runKey = [networkId, startsAt, endsAt, analysis.pipeline_version, inputHash].join(":");

  return {
    run: {
      network_id: networkId,
      starts_at: startsAt,
      ends_at: endsAt,
      pipeline_version: analysis.pipeline_version,
      taxonomy_version: analysis.taxonomy_version,
      input_event_count: events.length,
      input_hash: inputHash
    },
    facts: await Promise.all(analysis.facts.map(async (fact) => ({
      id: await deterministicUuid(`${runKey}:fact:${fact.category}`),
      dedupe_key: `fact:${fact.category}`,
      kind: fact.category,
      summary: `${categoryLabels[fact.category] ?? fact.category}: ${fact.mention_count} menções em ${fact.conversation_count} grupos.`,
      source_event_ids: fact.source_event_ids,
      occurred_at: fact.last_seen_at,
      payload: fact
    }))),
    signals: await Promise.all(analysis.signals.map(async (signal) => ({
      id: await deterministicUuid(`${runKey}:signal:${signal.kind}:${signal.category}`),
      dedupe_key: `signal:${signal.kind}:${signal.category}`,
      kind: signal.kind,
      summary: `${categoryLabels[signal.category] ?? signal.category}: sinal ${signal.kind}.`,
      source_event_ids: signal.source_event_ids,
      starts_at: startsAt,
      ends_at: endsAt,
      payload: signal
    }))),
    alerts: await Promise.all(analysis.alerts.map(async (alert) => ({
      id: await deterministicUuid(`${runKey}:alert:${alert.kind}:${alert.category}`),
      dedupe_key: `alert:${alert.kind}:${alert.category}`,
      severity: alert.severity,
      kind: alert.kind,
      title: categoryLabels[alert.category] ?? alert.category,
      summary: alert.reason,
      source_event_ids: alert.source_event_ids,
      payload: alert
    })))
  };
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function deterministicUuid(value) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

