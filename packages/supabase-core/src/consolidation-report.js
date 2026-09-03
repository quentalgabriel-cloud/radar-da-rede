import { createHash } from "node:crypto";

// The network id is stored as a repository secret. A stable, non-reversible
// reference keeps job summaries comparable between runs without printing it.
export function networkReference(networkId) {
  return createHash("sha256").update(String(networkId ?? "")).digest("hex").slice(0, 12);
}

export function buildConsolidationReport({ networkId, window, status, result = {}, error = null, durationMs = null }) {
  return {
    status,
    network_ref: networkReference(networkId),
    window_starts_at: window?.starts_at ?? null,
    window_ends_at: window?.ends_at ?? null,
    processing_run_id: result.processing_run_id ?? null,
    fact_count: numberOrNull(result.fact_count),
    signal_count: numberOrNull(result.signal_count),
    alert_count: numberOrNull(result.alert_count),
    group_metrics_persisted: result.group_metrics?.persisted ?? null,
    group_metrics_fallback_reason: result.group_metrics?.fallback_reason ?? null,
    capture_confidence: result.capture_confidence?.level ?? null,
    duration_ms: numberOrNull(durationMs),
    error
  };
}

export function renderConsolidationSummary(report) {
  const rows = [
    ["Status", report.status],
    ["Network ref", report.network_ref],
    ["Window start", report.window_starts_at ?? "—"],
    ["Window end", report.window_ends_at ?? "—"],
    ["Processing run", report.processing_run_id ?? "—"],
    ["Facts", display(report.fact_count)],
    ["Signals", display(report.signal_count)],
    ["Alerts", display(report.alert_count)],
    ["Group metrics persisted", display(report.group_metrics_persisted)],
    ["Metrics fallback reason", report.group_metrics_fallback_reason ?? "—"],
    ["Capture confidence", report.capture_confidence ?? "—"],
    ["Duration (ms)", display(report.duration_ms)]
  ];
  if (report.error) rows.push(["Error", report.error]);
  return [
    "## Consolidate Radar",
    "",
    "| Field | Value |",
    "| --- | --- |",
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
    ""
  ].join("\n");
}

const numberOrNull = (value) => (Number.isFinite(Number(value)) && value !== null ? Number(value) : null);
const display = (value) => (value === null || value === undefined ? "—" : String(value));
