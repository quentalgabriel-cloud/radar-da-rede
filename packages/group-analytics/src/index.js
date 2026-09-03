// Canonical group analytics engine.
// The synthetic laboratory, the Edge Functions and the tests must all read the
// metrics, condition, trend and Control Center rules from this module so that
// no environment can drift into its own interpretation of the same signal.

export const GROUP_METRICS_VERSION = "1.1.0";
export const GROUP_TREND_VERSION = "1.1.0";
export const CONTROL_CENTER_SCHEMA_VERSION = "0.2.0";

// Adjacent 24 hour windows overlap, so their difference is not a trend.
// The comparison is the same daily slot of the previous day, which produces two
// windows of equal length that do not share a single second.
export const COMPARISON_POLICY = "same_slot_previous_day@1";
export const COMPARISON_OFFSET_MS = 24 * 60 * 60 * 1000;
export const COMPARISON_END_TOLERANCE_MS = 30 * 60 * 1000;
export const COMPARISON_DURATION_TOLERANCE_MS = 5 * 60 * 1000;

// "Situações" are counted inside the window. They are not cases with an
// open/resolved lifecycle, so the product vocabulary says "no período".
export const SITUATION_SEMANTICS = "period_count";

const METRIC_COUNTERS = Object.freeze([
  "event_count", "fact_count", "alert_count", "demand_count",
  "agenda_count", "problem_count", "open_situation_count", "critical_situation_count"
]);

export function emptyMetric(groupId, captureConfidence) {
  const metric = { group_id: groupId };
  for (const counter of METRIC_COUNTERS) metric[counter] = 0;
  metric.capture_confidence = captureConfidence?.level ?? captureConfidence ?? "unavailable";
  metric.metrics_version = GROUP_METRICS_VERSION;
  return metric;
}

/**
 * Builds one metric row per monitored group. Groups without events in this run
 * receive an explicit zero row so that a later read can never present an older
 * window of that group as its current state.
 */
export function buildGroupMetrics({ events, analysis, groupLinks, captureConfidence, monitoredGroupIds = [] }) {
  const byGroup = new Map();
  for (const groupId of monitoredGroupIds) {
    if (groupId) byGroup.set(groupId, emptyMetric(groupId, captureConfidence));
  }
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
    for (const groupId of groupsFor(fact.source_event_ids, eventGroup)) {
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

export function computeMetricTrend(current, previous, captureConfidence, comparison = {}) {
  const confidence = captureConfidence ?? "unavailable";
  const base = {
    metric: "event_count",
    current,
    previous,
    comparison_policy: COMPARISON_POLICY,
    capture_confidence: confidence
  };
  if (previous == null) {
    return { ...base, delta: null, percent: null, direction: "unavailable",
      unavailable_reason: comparison.reason ?? "comparison_unavailable",
      combined_volume: current };
  }
  if (["low", "unavailable"].includes(confidence)) {
    return { ...base, delta: null, percent: null, direction: "unavailable",
      unavailable_reason: "capture_confidence_insufficient",
      combined_volume: current + previous };
  }
  const delta = current - previous;
  const stableLimit = Math.max(2, previous * 0.2);
  const direction = Math.abs(delta) < stableLimit ? "stable" : delta > 0 ? "growing" : "declining";
  const combinedVolume = current + previous;
  const percent = previous >= 5 && combinedVolume >= 10 ? Math.round((delta / previous) * 1000) / 10 : null;
  return { ...base, delta, percent, direction, unavailable_reason: null, combined_volume: combinedVolume };
}

export function deriveGroupCondition(metric) {
  if ((metric?.critical_situation_count ?? 0) > 0) return "critical";
  if ((metric?.open_situation_count ?? 0) > 0) return "attention";
  if ((metric?.problem_count ?? 0) > 0) return "watch";
  return "normal";
}

const runDuration = (run) => Date.parse(run?.ends_at) - Date.parse(run?.starts_at);
const runKind = (run) => run?.window_kind ?? "canonical_slot";

// Uma mesma janela pode ter mais de uma execução: eventos atrasados do outbox
// mudam o conjunto analisado e produzem uma execução nova para o mesmo período.
// A mais recentemente concluída supera as anteriores. Sem esse desempate a
// âncora dependeria da ordem de retorno do banco e poderia eleger a execução
// antiga como estado atual.
const runRecency = (a, b) => Date.parse(b.ends_at) - Date.parse(a.ends_at)
  || completedAt(b) - completedAt(a)
  || String(b.id).localeCompare(String(a.id));

const completedAt = (run) => {
  const value = Date.parse(run?.completed_at ?? "");
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
};

export function selectCurrentRun(runs = []) {
  const usable = runs.filter((run) => run?.id && Number.isFinite(Date.parse(run.ends_at))
    && Number.isFinite(Date.parse(run.starts_at)));
  if (usable.length === 0) return null;
  return [...usable].sort(runRecency)[0];
}

/**
 * Applies COMPARISON_POLICY. Returns the comparison run or an explicit reason.
 * It never falls back to "whatever other row exists", because an adjacent
 * moving window shares 23 of its 24 hours with the current one.
 */
export function selectComparisonRun(currentRun, runs = []) {
  if (!currentRun) return { run: null, reason: "no_current_run" };
  const currentEnd = Date.parse(currentRun.ends_at);
  const duration = runDuration(currentRun);
  if (!Number.isFinite(currentEnd) || !Number.isFinite(duration)) {
    return { run: null, reason: "invalid_current_run" };
  }
  const target = currentEnd - COMPARISON_OFFSET_MS;
  // A window produced by a manual refresh does not sit on a canonical slot, so
  // it can never stand in for the scheduled comparator and vice versa.
  const comparable = (run) => run?.id && run.id !== currentRun.id
    && runKind(run) === runKind(currentRun)
    && Math.abs(runDuration(run) - duration) <= COMPARISON_DURATION_TOLERANCE_MS;
  const candidates = runs
    .filter(comparable)
    .map((run) => ({ run, distance: Math.abs(Date.parse(run.ends_at) - target) }))
    .filter((candidate) => Number.isFinite(candidate.distance))
    // Empate de distância também é decidido pela execução mais recente, para
    // que uma janela reprocessada não perca para a sua própria versão antiga.
    .sort((a, b) => a.distance - b.distance || runRecency(a.run, b.run));
  const match = candidates.find((candidate) => candidate.distance <= COMPARISON_END_TOLERANCE_MS);
  if (match) return { run: match.run, reason: null };
  if (runKind(currentRun) !== "canonical_slot") {
    return { run: null, reason: "current_window_is_not_a_canonical_slot" };
  }
  if (candidates.length > 0) return { run: null, reason: "no_run_at_previous_day_slot" };
  const others = runs.filter((run) => run?.id && run.id !== currentRun.id);
  return { run: null, reason: others.length === 0 ? "no_previous_run" : "no_comparable_window" };
}

/**
 * Builds the Control Center anchored on one network-level run.
 * Every monitored group is represented by the current run, either with its
 * persisted row or with a synthesized zero. No group ever contributes a row
 * from a different run as its current state.
 */
export function buildGroupControlCenter({
  groups = [], metrics = [], runs = [], enabled = false, capture = null, currentRunId = null
}) {
  const knownRuns = runs.length > 0 ? runs : runsFromMetrics(metrics);
  const currentRun = currentRunId
    ? knownRuns.find((run) => run.id === currentRunId) ?? selectCurrentRun(knownRuns)
    : selectCurrentRun(knownRuns);
  const comparison = selectComparisonRun(currentRun, knownRuns);

  const rowsByRun = new Map();
  for (const metric of metrics) {
    const bucket = rowsByRun.get(metric.processing_run_id) ?? new Map();
    bucket.set(metric.group_id, metric);
    rowsByRun.set(metric.processing_run_id, bucket);
  }
  const currentRows = rowsByRun.get(currentRun?.id) ?? new Map();
  const comparisonRows = rowsByRun.get(comparison.run?.id) ?? new Map();
  // A synthesized zero belongs to the current run and therefore carries the
  // capture confidence of that run, not a default of "unavailable" that would
  // silently hide exactly the groups that went quiet.
  const currentConfidence = runConfidence(currentRun, currentRows, capture);
  const comparisonConfidenceLevel = runConfidence(comparison.run, comparisonRows, null);

  const orderedRuns = [...knownRuns]
    .filter((run) => currentRun && Date.parse(run.ends_at) <= Date.parse(currentRun.ends_at))
    .sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at))
    .slice(-8);

  let synthesizedZeros = 0;
  const items = groups.map((group) => {
    const persisted = currentRows.get(group.id) ?? null;
    if (!persisted && currentRun) synthesizedZeros += 1;
    const current = persisted ?? emptyMetric(group.id, currentConfidence);
    const previousRow = comparison.run
      ? comparisonRows.get(group.id) ?? emptyMetric(group.id, comparisonConfidenceLevel)
      : null;
    const confidence = currentRun ? current.capture_confidence ?? "unavailable" : "unavailable";
    const comparisonConfidence = comparison.run
      ? comparableConfidence(confidence, previousRow?.capture_confidence)
      : "unavailable";
    const situationCount = current.open_situation_count ?? 0;
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
      trend: computeMetricTrend(
        current.event_count ?? 0,
        previousRow ? previousRow.event_count ?? 0 : null,
        comparisonConfidence,
        comparison
      ),
      event_count: current.event_count ?? 0,
      situation_count: situationCount,
      situation_semantics: SITUATION_SEMANTICS,
      // Kept for the v0.2 consumers shipped before the vocabulary correction.
      open_situation_count: situationCount,
      metric_source: persisted ? "persisted" : currentRun ? "synthesized_zero" : "unavailable",
      last_seen_at: group.last_seen_at,
      capture_confidence: confidence,
      topics: topicsFor(current),
      sparkline: orderedRuns.map((run) => ({
        at: run.ends_at,
        run_id: run.id,
        value: (rowsByRun.get(run.id)?.get(group.id)?.event_count) ?? 0
      }))
    };
  });

  const contexts = new Map();
  for (const item of items) {
    const key = `${item.context.type ?? "unknown"}:${item.context.label ?? "Sem contexto"}`;
    const context = contexts.get(key) ?? {
      id: key, type: item.context.type, label: item.context.label ?? "Sem contexto",
      group_count: 0, event_count: 0, situation_count: 0, open_situation_count: 0
    };
    context.group_count += 1;
    context.event_count += item.event_count;
    context.situation_count += item.situation_count;
    context.open_situation_count = context.situation_count;
    contexts.set(key, context);
  }

  const unexpectedRows = [...currentRows.keys()].filter((groupId) => !groups.some((group) => group.id === groupId));
  return {
    schema_version: CONTROL_CENTER_SCHEMA_VERSION,
    enabled: enabled === true,
    available: Boolean(currentRun),
    metrics_version: GROUP_METRICS_VERSION,
    trend_version: GROUP_TREND_VERSION,
    situation_semantics: SITUATION_SEMANTICS,
    anchor: {
      current_run_id: currentRun?.id ?? null,
      current_window_start: currentRun?.starts_at ?? null,
      current_window_end: currentRun?.ends_at ?? null,
      comparison_policy: COMPARISON_POLICY,
      comparison_run_id: comparison.run?.id ?? null,
      comparison_window_start: comparison.run?.starts_at ?? null,
      comparison_window_end: comparison.run?.ends_at ?? null,
      comparison_unavailable_reason: comparison.run ? null : comparison.reason,
      windows_overlap: windowsOverlap(currentRun, comparison.run)
    },
    capture: capture ?? null,
    consistency: {
      monitored_group_count: items.length,
      persisted_metric_count: currentRows.size,
      synthesized_zero_count: synthesizedZeros,
      unexpected_metric_group_count: unexpectedRows.length,
      consistent: unexpectedRows.length === 0
        && currentRows.size + synthesizedZeros === items.length
    },
    summary: {
      monitored: items.length,
      active: items.filter((item) => item.event_count > 0).length,
      attention: items.filter((item) => ["attention", "critical"].includes(item.condition)).length,
      declining: items.filter((item) => item.trend.direction === "declining").length,
      unclassified: items.filter((item) => item.classification_status !== "confirmed").length,
      trend_unavailable: items.filter((item) => item.trend.direction === "unavailable").length
    },
    groups: items,
    contexts: [...contexts.values()]
  };
}

function topicsFor(metric) {
  return [["Demandas", metric.demand_count ?? 0], ["Agendas", metric.agenda_count ?? 0], ["Problemas", metric.problem_count ?? 0]]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([label, count]) => ({ label, count }));
}

function runConfidence(run, rows, capture) {
  if (!run) return "unavailable";
  if (capture?.level) return capture.level;
  if (typeof capture === "string") return capture;
  if (run.capture_confidence) return run.capture_confidence;
  for (const row of rows.values()) {
    if (row?.capture_confidence) return row.capture_confidence;
  }
  return "unavailable";
}

function runsFromMetrics(metrics) {
  const runs = new Map();
  for (const metric of metrics) {
    if (!metric?.processing_run_id || runs.has(metric.processing_run_id)) continue;
    runs.set(metric.processing_run_id, {
      id: metric.processing_run_id, starts_at: metric.starts_at, ends_at: metric.ends_at
    });
  }
  return [...runs.values()];
}

function windowsOverlap(current, comparison) {
  if (!current || !comparison) return false;
  return Date.parse(comparison.ends_at) > Date.parse(current.starts_at)
    && Date.parse(comparison.starts_at) < Date.parse(current.ends_at);
}

function groupsFor(ids, eventGroup) {
  return new Set((ids ?? []).map((id) => eventGroup.get(id)).filter(Boolean));
}

function comparableConfidence(current, previous) {
  if (!previous || current === "unavailable" || previous === "unavailable") return "unavailable";
  if (current === "low" || previous === "low") return "low";
  if (current === "moderate" || previous === "moderate") return "moderate";
  return current === "high" && previous === "high" ? "high" : "unavailable";
}
