import { canonicalConsolidationWindow } from "../src/consolidation-schedule.js";

const required = ["RADAR_SUPABASE_URL", "RADAR_NETWORK_ID", "RADAR_PROCESSING_SECRET"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) throw new Error(`Missing consolidation configuration: ${missing.join(", ")}`);

const window = canonicalConsolidationWindow(new Date());
const response = await fetch(`${process.env.RADAR_SUPABASE_URL}/functions/v1/process-window`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${process.env.RADAR_PROCESSING_SECRET}`,
    "content-type": "application/json"
  },
  body: JSON.stringify({ network_id: process.env.RADAR_NETWORK_ID, ...window })
});
const result = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Consolidation failed (${response.status}): ${result.error ?? "unknown_error"}`);
console.log(JSON.stringify({ status: "completed", window, result }));
