// Vigilância operacional do Radar.
//
// A consolidação roda seis vezes ao dia e o aparelho reporta sozinho. Sem este
// verificador, uma parada de qualquer um dos dois passaria despercebida até
// alguém estranhar o dado — o que, num fim de semana, pode levar dois dias.
//
// A decisão vive aqui, separada de qualquer consulta ao banco, para poder ser
// testada com relógio controlado. Quem lê o banco é o script.

export const OPERATIONAL_HEALTH_VERSION = "operational_health@1";

// Todos os limites vêm de comportamento medido em 2026-09-03/04, não de
// arbitragem. A origem de cada número está no comentário ao lado.
export const DEFAULT_THRESHOLDS = Object.freeze({
  // Seis slots diários, vão máximo de cinco horas. Uma hora de folga cobre
  // atraso de fila do GitHub Actions sem tolerar um slot inteiro perdido.
  processingLateAfterMinutes: 6 * 60,
  // O heartbeat chega a cada 3,6 min em média e o maior vão observado na
  // primeira noite foi 41,4 min. Três horas significa parada real, não Doze.
  heartbeatLateAfterMinutes: 180,
  // A execução precisa cobrir todo grupo ativo. Qualquer falta é inconsistência
  // de persistência, não silêncio de grupo: o zero é explícito.
  allowMissingMetricRows: 0,
  // Volume diário observado entre 59 e 302 eventos. Cem eventos fora da janela
  // consolidada indicam que a consolidação está ficando para trás.
  eventsAfterWindowWarning: 100
});

const MINUTE = 60_000;

const minutesSince = (now, value) => {
  const at = Date.parse(value ?? "");
  return Number.isFinite(at) ? (now - at) / MINUTE : null;
};

const round = (value) => (value === null ? null : Math.round(value));

/**
 * Recebe a leitura do ambiente e devolve o veredito. Nunca lança: um campo
 * ausente vira problema declarado, porque não saber é pior que saber que quebrou.
 */
export function evaluateOperationalHealth(snapshot = {}, options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds ?? {}) };
  const now = Date.parse(options.now ?? new Date().toISOString());
  if (!Number.isFinite(now)) {
    return report([problem("invalid_clock", "O horário de referência é inválido.",
      "Verifique o relógio do runner antes de confiar em qualquer alerta.")], thresholds);
  }

  const problems = [];

  const processingAge = minutesSince(now, snapshot.lastProcessingCompletedAt);
  if (processingAge === null) {
    problems.push(problem(
      "no_processing_run",
      "Nenhuma consolidação concluída foi encontrada.",
      "Rode o workflow Consolidate Radar manualmente e confirme os três secrets."
    ));
  } else if (processingAge > thresholds.processingLateAfterMinutes) {
    problems.push(problem(
      "processing_late",
      `A última consolidação terminou há ${round(processingAge)} min, acima do limite de ${thresholds.processingLateAfterMinutes} min.`,
      "Verifique as execuções recentes do workflow Consolidate Radar e se a credencial de processamento continua ativa.",
      { observed_minutes: round(processingAge) }
    ));
  }

  const heartbeatAge = minutesSince(now, snapshot.lastHeartbeatAt);
  if (heartbeatAge === null) {
    problems.push(problem(
      "no_heartbeat",
      "Nenhum heartbeat do aparelho foi encontrado.",
      "Confirme se o Moto G84 está ligado, com internet e com o Radar Sensor ativo."
    ));
  } else if (heartbeatAge > thresholds.heartbeatLateAfterMinutes) {
    problems.push(problem(
      "heartbeat_late",
      `O último heartbeat chegou há ${round(heartbeatAge)} min, acima do limite de ${thresholds.heartbeatLateAfterMinutes} min.`,
      "Verifique o aparelho. Enquanto isso a captura pode estar parada, e o Radar mostrará dado antigo.",
      { observed_minutes: round(heartbeatAge) }
    ));
  }

  const monitored = Number(snapshot.activeGroupCount);
  const persisted = Number(snapshot.metricRowsInLatestRun);
  if (Number.isFinite(monitored) && Number.isFinite(persisted)) {
    const missing = monitored - persisted;
    if (missing > thresholds.allowMissingMetricRows) {
      problems.push(problem(
        "incomplete_metrics",
        `A execução mais recente cobriu ${persisted} de ${monitored} grupos ativos; faltam ${missing}.`,
        "A execução ficou parcial. Reprocesse a janela e confirme se persist_analysis_v3 está disponível.",
        { monitored, persisted, missing }
      ));
    }
  } else {
    problems.push(problem(
      "metrics_unreadable",
      "Não foi possível comparar grupos ativos com linhas de métrica.",
      "Confirme o acesso de leitura a groups e group_metric_windows."
    ));
  }

  const pending = Number(snapshot.eventsAfterWindow ?? 0);
  if (Number.isFinite(pending) && pending > thresholds.eventsAfterWindowWarning) {
    problems.push(problem(
      "consolidation_behind",
      `Há ${pending} eventos fora da janela consolidada, acima do limite de ${thresholds.eventsAfterWindowWarning}.`,
      "A captura está à frente da consolidação. Force uma janela pelo botão de atualizar ou aguarde o próximo slot.",
      { observed_events: pending }
    ));
  }

  return report(problems, thresholds, {
    processing_age_minutes: round(processingAge),
    heartbeat_age_minutes: round(heartbeatAge),
    active_groups: Number.isFinite(monitored) ? monitored : null,
    metric_rows: Number.isFinite(persisted) ? persisted : null,
    events_after_window: Number.isFinite(pending) ? pending : null
  });
}

export function renderOperationalHealthSummary(result) {
  const linhas = [
    "## Vigilância operacional do Radar",
    "",
    `Situação: **${result.healthy ? "sem problemas" : `${result.problems.length} problema(s)`}**`,
    "",
    "| Observação | Valor |",
    "| --- | --- |",
    `| Consolidação concluída há | ${display(result.observed.processing_age_minutes, "min")} |`,
    `| Heartbeat recebido há | ${display(result.observed.heartbeat_age_minutes, "min")} |`,
    `| Grupos ativos | ${display(result.observed.active_groups)} |`,
    `| Linhas de métrica na execução | ${display(result.observed.metric_rows)} |`,
    `| Eventos fora da janela | ${display(result.observed.events_after_window)} |`,
    ""
  ];
  if (!result.healthy) {
    linhas.push("### O que fazer", "");
    for (const item of result.problems) {
      linhas.push(`- **${item.code}** — ${item.summary}`, `  - ${item.action}`);
    }
    linhas.push("");
  }
  return linhas.join("\n");
}

const problem = (code, summary, action, evidence = {}) => ({ code, summary, action, evidence });

const report = (problems, thresholds, observed = {}) => ({
  version: OPERATIONAL_HEALTH_VERSION,
  healthy: problems.length === 0,
  problems,
  thresholds,
  observed
});

const display = (value, unit = "") => (value === null || value === undefined
  ? "—"
  : `${value}${unit ? ` ${unit}` : ""}`);
