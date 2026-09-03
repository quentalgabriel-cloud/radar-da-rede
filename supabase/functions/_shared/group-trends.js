export const GROUP_TREND_VERSION = "1.0.0";

export function computeMetricTrend(current, previous, captureConfidence) {
  const confidence = captureConfidence ?? "unavailable";
  if (["low", "unavailable"].includes(confidence) || previous == null) {
    return trendResult(current, previous, null, null, "unavailable", confidence);
  }
  const delta = current - previous;
  const stableLimit = Math.max(2, previous * 0.2);
  const direction = Math.abs(delta) < stableLimit ? "stable" : delta > 0 ? "growing" : "declining";
  const combinedVolume = current + previous;
  const percent = previous >= 5 && combinedVolume >= 10 ? Math.round((delta / previous) * 1000) / 10 : null;
  return trendResult(current, previous, delta, percent, direction, confidence);
}

export function deriveGroupCondition(metric) {
  if ((metric?.critical_situation_count ?? 0) > 0) return "critical";
  if ((metric?.open_situation_count ?? 0) > 0) return "attention";
  if ((metric?.problem_count ?? 0) > 0) return "watch";
  return "normal";
}

export function buildGroupControlCenter({ groups = [], metrics = [], enabled = false }) {
  const metricsByGroup = new Map();
  for (const metric of metrics) {
    const rows = metricsByGroup.get(metric.group_id) ?? [];
    rows.push(metric);
    metricsByGroup.set(metric.group_id, rows);
  }
  const items = groups.map((group) => {
    const rows = (metricsByGroup.get(group.id) ?? []).sort((a, b) => Date.parse(b.ends_at) - Date.parse(a.ends_at));
    const current = rows[0] ?? null;
    const currentDuration = current ? Date.parse(current.ends_at) - Date.parse(current.starts_at) : null;
    const previous = currentDuration == null ? null : rows.slice(1).find((row) => {
      const duration = Date.parse(row.ends_at) - Date.parse(row.starts_at);
      return Number.isFinite(duration) && Math.abs(duration - currentDuration) <= Math.max(60_000, currentDuration * 0.05);
    }) ?? null;
    const confidence = current?.capture_confidence ?? "unavailable";
    const comparisonConfidence = comparableConfidence(confidence, previous?.capture_confidence);
    return {
      id: group.id,
      label: group.current_label,
      origin: group.origin,
      context: {
        type: group.context_type,
        label: group.context_label,
        municipality: group.municipality,
        territory: group.territory,
        steward: group.primary_steward_label
      },
      classification_status: group.classification_status,
      condition: deriveGroupCondition(current),
      trend: computeMetricTrend(current?.event_count ?? 0, previous?.event_count ?? null, comparisonConfidence),
      event_count: current?.event_count ?? 0,
      open_situation_count: current?.open_situation_count ?? 0,
      last_seen_at: group.last_seen_at,
      capture_confidence: confidence,
      topics: current ? [
        ["Demandas", current.demand_count], ["Agendas", current.agenda_count], ["Problemas", current.problem_count]
      ].filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([label, count]) => ({ label, count })) : [],
      sparkline: rows.slice(0, 8).reverse().map((row) => ({ at: row.ends_at, value: row.event_count }))
    };
  });
  const contexts = new Map();
  for (const item of items) {
    const key = `${item.context.type ?? "unknown"}:${item.context.label ?? "Sem contexto"}`;
    const context = contexts.get(key) ?? { id: key, type: item.context.type, label: item.context.label ?? "Sem contexto", group_count: 0, event_count: 0, open_situation_count: 0 };
    context.group_count += 1;
    context.event_count += item.event_count;
    context.open_situation_count += item.open_situation_count;
    contexts.set(key, context);
  }
  return {
    schema_version: "0.2.0",
    enabled: enabled === true,
    available: items.some((item) => item.sparkline.length > 0),
    metrics_version: "1.0.0",
    trend_version: GROUP_TREND_VERSION,
    summary: {
      monitored: items.length,
      active: items.filter((item) => item.event_count > 0).length,
      attention: items.filter((item) => ["attention", "critical"].includes(item.condition)).length,
      declining: items.filter((item) => item.trend.direction === "declining").length,
      unclassified: items.filter((item) => item.classification_status !== "confirmed").length
    },
    groups: items,
    contexts: [...contexts.values()]
  };
}

function trendResult(current, previous, delta, percent, direction, confidence) {
  return {
    metric: "event_count",
    current,
    previous,
    delta,
    percent,
    direction,
    combined_volume: previous == null ? current : current + previous,
    capture_confidence: confidence
  };
}

function comparableConfidence(current, previous) {
  if (!previous || current === "unavailable" || previous === "unavailable") return "unavailable";
  if (current === "low" || previous === "low") return "low";
  if (current === "moderate" || previous === "moderate") return "moderate";
  return current === "high" && previous === "high" ? "high" : "unavailable";
}
