import { appendFileSync } from "node:fs";
import { describeConsolidationConfig } from "../src/consolidation-config.js";
import { evaluateOperationalHealth, renderOperationalHealthSummary } from "../src/operational-health.js";

// Vigilância independente da consolidação. Se ela dependesse do mesmo caminho,
// a mesma falha que parasse o processamento silenciaria o alerta.
const configuration = describeConsolidationConfig(process.env);
if (!configuration.configured) {
  for (const line of configuration.lines) console.error(line);
  console.error(configuration.operatorInstruction);
  process.exitCode = 1;
} else {
  const url = process.env.RADAR_SUPABASE_URL.trim();
  const networkId = process.env.RADAR_NETWORK_ID.trim();
  const secret = process.env.RADAR_PROCESSING_SECRET;

  const snapshot = await readSnapshot(url, networkId, secret);
  const result = evaluateOperationalHealth(snapshot.data, {});
  publish(renderOperationalHealthSummary(result));
  console.log(JSON.stringify({ ...result, read_error: snapshot.error }));

  if (snapshot.error) {
    console.error(`Não foi possível ler o estado operacional: ${snapshot.error}`);
    process.exitCode = 1;
  } else if (!result.healthy) {
    for (const problem of result.problems) console.error(`${problem.code}: ${problem.summary} → ${problem.action}`);
    process.exitCode = 1;
  }
}

// A leitura usa a mesma credencial de processamento, sem service role e sem
// expor o identificador da rede em log.
async function readSnapshot(url, networkId, secret) {
  try {
    const response = await fetch(`${url}/functions/v1/operational-health?network_id=${encodeURIComponent(networkId)}`, {
      headers: { authorization: `Bearer ${secret}` }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { data: {}, error: `http_${response.status}:${body.error ?? "unknown"}` };
    return { data: body, error: null };
  } catch (cause) {
    return { data: {}, error: cause.message };
  }
}

function publish(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  try {
    appendFileSync(summaryPath, markdown);
  } catch (cause) {
    console.error(`step_summary_unavailable:${cause.code ?? "unknown"}`);
  }
}
