import { appendFileSync } from "node:fs";
import { canonicalConsolidationWindow } from "../src/consolidation-schedule.js";
import { describeConsolidationConfig } from "../src/consolidation-config.js";
import { buildConsolidationReport, renderConsolidationSummary } from "../src/consolidation-report.js";

const configuration = describeConsolidationConfig(process.env);
if (!configuration.configured) {
  for (const line of configuration.lines) console.error(line);
  console.error(configuration.operatorInstruction);
  process.exit(1);
}

const networkId = process.env.RADAR_NETWORK_ID.trim();
const window = canonicalConsolidationWindow(new Date());
const startedAt = Date.now();

let report;
try {
  const response = await fetch(`${process.env.RADAR_SUPABASE_URL.trim()}/functions/v1/process-window`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RADAR_PROCESSING_SECRET}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ network_id: networkId, ...window })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`consolidation_failed_http_${response.status}:${result.error ?? "unknown_error"}`);
  }
  report = buildConsolidationReport({
    networkId, window, status: "completed", result, durationMs: Date.now() - startedAt
  });
} catch (cause) {
  report = buildConsolidationReport({
    networkId, window, status: "failed", error: cause.message, durationMs: Date.now() - startedAt
  });
}

publish(report);
console.log(JSON.stringify(report));
if (report.status !== "completed") {
  process.exitCode = 1;
} else if (report.processing_run_id === null) {
  console.error("Consolidation answered without a processing run id; the canonical step did not persist a window.");
  process.exitCode = 1;
}

function publish(value) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  try {
    appendFileSync(summaryPath, renderConsolidationSummary(value));
  } catch (cause) {
    console.error(`step_summary_unavailable:${cause.code ?? "unknown"}`);
  }
}
