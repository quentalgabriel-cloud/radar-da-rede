const MINUTE = 60_000;

const elapsed = (now, value) => value ? Math.max(0, now - Date.parse(value)) : Number.POSITIVE_INFINITY;
const recent = (now, value, maximum) => elapsed(now, value) <= maximum;

const layer = (state, label, detail) => ({ state, label, detail });

export const evaluateCaptureHealth = (health, options = {}) => {
  const now = Date.parse(options.now ?? new Date().toISOString());
  const heartbeatMaxAge = options.heartbeatMaxAgeMs ?? 35 * MINUTE;
  const activityQuietAge = options.activityQuietAgeMs ?? 60 * MINUTE;
  const parserLagAge = options.parserLagAgeMs ?? 5 * MINUTE;
  const uploadLagAge = options.uploadLagAgeMs ?? 15 * MINUTE;

  if (!health?.observed_at || elapsed(now, health.observed_at) > heartbeatMaxAge) {
    return result("INTERRUPTED", "Captura interrompida", "O aparelho deixou de enviar atualizações.", {
      device: layer("critical", "Sem contato", "Último contato fora do intervalo esperado."),
      capture: layer("unknown", "Sem confirmação", "Não é possível confirmar a captura sem contato com o aparelho."),
      sync: layer("unknown", "Sem confirmação", "Não é possível confirmar a sincronização."),
      action: "Verifique se o Moto G84 está ligado, com internet e com o Radar Sensor aberto.",
      humanActionRequired: true,
      reason: "heartbeat_expired"
    });
  }

  if (health.notification_access === false || health.whatsapp_installed === false) {
    const accessMissing = health.notification_access === false;
    return result("SETUP_REQUIRED", "Configuração necessária", accessMissing
      ? "O Radar Sensor não tem acesso às notificações."
      : "O WhatsApp não foi encontrado no aparelho.", {
      device: layer("ok", "Online", "O aparelho está enviando atualizações."),
      capture: layer("critical", accessMissing ? "Acesso desativado" : "WhatsApp não encontrado", "A captura não pode continuar nesta configuração."),
      sync: synchronizationLayer(health, now, uploadLagAge),
      action: accessMissing
        ? "Abra o Radar Sensor no Moto G84 e ative o acesso às notificações."
        : "Confirme a instalação do WhatsApp oficial no Moto G84.",
      humanActionRequired: true,
      reason: accessMissing ? "notification_access_disabled" : "whatsapp_not_installed"
    });
  }

  if (health.listener_connected === false) {
    return result("INTERRUPTED", "Captura interrompida", "O sensor perdeu a conexão com as notificações do aparelho.", {
      device: layer("ok", "Online", "O aparelho está enviando atualizações."),
      capture: layer("critical", "Sensor desconectado", "A recuperação automática foi solicitada."),
      sync: synchronizationLayer(health, now, uploadLagAge),
      action: "Aguarde a tentativa automática. Se não normalizar, abra o Radar Sensor no Moto G84.",
      humanActionRequired: false,
      reason: "listener_disconnected"
    });
  }

  const notificationRecent = recent(now, health.last_whatsapp_notification_at, parserLagAge);
  const parsedAfterNotification = health.last_parsed_event_at && health.last_whatsapp_notification_at
    && Date.parse(health.last_parsed_event_at) >= Date.parse(health.last_whatsapp_notification_at);
  if (notificationRecent && !parsedAfterNotification) {
    return result("ATTENTION", "Leitura precisa de atenção", "Uma notificação foi detectada, mas ainda não virou atividade no Radar.", {
      device: layer("ok", "Online", "O aparelho está enviando atualizações."),
      capture: layer("warning", "Leitura atrasada", "A notificação chegou, mas ainda não foi interpretada."),
      sync: synchronizationLayer(health, now, uploadLagAge),
      action: "Nenhuma ação imediata. O sistema continuará observando; verifique o parser se o atraso persistir.",
      humanActionRequired: false,
      reason: "parser_degraded"
    });
  }

  const sync = synchronizationLayer(health, now, uploadLagAge);
  if (sync.state === "critical" || sync.state === "warning" || health.status === "degraded") {
    return result("ATTENTION", "Sincronização em acompanhamento", sync.detail, {
      device: layer("ok", "Online", "O aparelho está enviando atualizações."),
      capture: layer("ok", "Sensor conectado", "A captura continua ativa."),
      sync,
      action: Number(health.outbox_pending ?? 0) > 0
        ? "Nenhuma ação necessária enquanto a conexão tenta enviar os itens pendentes."
        : "Acompanhe a próxima atualização antes de intervir no aparelho.",
      humanActionRequired: false,
      reason: sync.state === "critical" ? "network_offline" : "queue_backlog"
    });
  }

  const lastActivity = health.last_whatsapp_notification_at ?? health.last_event_captured_at;
  if (!recent(now, lastActivity, activityQuietAge)) {
    return result("NO_RECENT_ACTIVITY", "Sem atividade recente", "O aparelho está saudável, mas nenhuma notificação recente foi observada.", {
      device: layer("ok", "Online", "O aparelho está enviando atualizações."),
      capture: layer("neutral", "Aguardando atividade", "Não há evidência de falha; pode simplesmente não haver novas mensagens."),
      sync,
      action: "Nenhuma ação necessária. Use “Testar captura” para uma verificação ativa.",
      humanActionRequired: false,
      reason: "no_recent_activity"
    });
  }

  const recoveredRecently = health.status === "offline_recovery" || health.recovered_at && recent(now, health.recovered_at, 30 * MINUTE);
  return result("NORMAL", recoveredRecently ? "Captura restabelecida" : "Captura normal", recoveredRecently
    ? "A cadeia voltou a funcionar e os dados pendentes estão sendo sincronizados."
    : "Temos evidência recente de captura e sincronização.", {
    device: layer("ok", "Online", "O aparelho está enviando atualizações."),
    capture: layer("ok", "Normal", "Notificações recentes foram interpretadas."),
    sync,
    action: recoveredRecently ? "Nenhuma ação necessária; a recuperação aconteceu automaticamente." : "Nenhuma ação necessária.",
    humanActionRequired: false,
    reason: recoveredRecently ? "recovered" : "healthy"
  });
};

const synchronizationLayer = (health, now, uploadLagAge) => {
  if (health.network_type === "offline") return layer("critical", "Sem internet", "O aparelho está sem conexão para enviar os dados.");
  const pending = Number(health.outbox_pending ?? 0);
  const oldestIsLate = pending > 0 && elapsed(now, health.oldest_pending_at) > uploadLagAge;
  if (oldestIsLate) return layer("warning", `${pending} ${pending === 1 ? "envio pendente" : "envios pendentes"}`, "Os dados estão guardados no aparelho e aguardam sincronização.");
  if (pending > 0) return layer("neutral", `${pending} ${pending === 1 ? "envio pendente" : "envios pendentes"}`, "A fila está dentro do intervalo normal de envio.");
  return layer("ok", "Normal", "Nenhum envio está pendente.");
};


export const evaluateCaptureConfidence = (health, options = {}) => {
  const startsAt = Date.parse(options.startsAt ?? "");
  const endsAt = Date.parse(options.endsAt ?? new Date().toISOString());
  const transitions = options.transitions ?? [];
  if (!health?.observed_at || !Number.isFinite(startsAt) || !Number.isFinite(endsAt)) {
    return confidence("unavailable", "health_or_window_unavailable");
  }
  if ([health.notification_access, health.listener_connected, health.whatsapp_installed, health.network_type]
    .some((value) => value === null || value === undefined)) {
    return confidence("unavailable", "health_fields_incomplete");
  }
  if (Date.parse(health.observed_at) < startsAt) {
    return confidence("unavailable", "heartbeat_does_not_cover_window");
  }
  if (health.notification_access === false || health.whatsapp_installed === false) {
    return confidence("unavailable", "capture_not_configured");
  }
  if (health.listener_connected === false) return confidence("low", "listener_disconnected");
  if (health.network_type === "offline") return confidence("low", "network_offline");
  if (Number(health.outbox_pending ?? 0) > 0) return confidence("low", "queue_not_drained");

  const relevant = transitions.filter((transition) => {
    const occurredAt = Date.parse(transition?.occurred_at);
    return Number.isFinite(occurredAt) && occurredAt >= startsAt && occurredAt <= endsAt;
  });
  if (relevant.some((transition) => [
    "listener_disconnected", "setup_required", "network_offline", "queue_backlog"
  ].includes(transition.kind))) return confidence("low", "capture_incident_in_window");
  if (health.status === "offline_recovery" || relevant.some((transition) => transition.kind === "recovered")) {
    return confidence("moderate", "recovered_in_window");
  }
  if (health.status === "degraded") return confidence("moderate", "adapter_degraded");
  return confidence("high", "capture_covered_window");
};

const confidence = (level, reason) => ({
  level,
  reason,
  trend_valid: level === "high" || level === "moderate"
});


const result = (state, label, summary, detail) => ({
  state,
  level: state === "NORMAL" ? "ok" : state === "NO_RECENT_ACTIVITY" ? "neutral" : state === "ATTENTION" ? "warning" : "critical",
  label,
  summary,
  reason: detail.reason,
  human_action_required: detail.humanActionRequired,
  next_action: detail.action,
  layers: { device: detail.device, capture: detail.capture, sync: detail.sync }
});


// --- Capture coverage (P1.1) -------------------------------------------------
// A single recent heartbeat cannot prove continuity across a 24 hour window.
// Coverage is measured from append-only samples: two consecutive samples closer
// than the tolerated gap are evidence that capture was alive between them.

export const CAPTURE_COVERAGE_VERSION = "capture_coverage@2";

// Tolerância de ponte entre amostras, calibrada com a primeira noite real de
// operação (2026-09-03/04) em vez de arbitrada.
//
// O sensor pede heartbeat a cada 15 min por PeriodicWorkRequest, e o Doze do
// Android adia esse disparo. Medido: 3,6 min de intervalo médio diurno, 16,7 min
// de máximo diurno e 41,4 min de máximo noturno. Varrendo a tolerância sobre as
// amostras reais, 35 min deixava dois vãos sem ponte e 40 min deixava um;
// 45 min ponteia todos, e 50, 60 ou 90 não acrescentam nada. É o joelho da
// curva, não um número escolhido para a métrica melhorar.
//
// Os vãos são adiamento do agendador, não perda de captura: o diagnóstico do
// aparelho mostra listener conectado sem interrupção desde 2026-08-29 e os
// eventos continuaram chegando durante eles.
//
// Salvaguarda que torna esta calibração incapaz de inflar o resultado: `high`
// exige também configuração de captura confirmada pelo adaptador, que o sensor
// atual não reporta. Subir a tolerância portanto **não** destrava `high`; ela só
// impede um `low` falso, que suprimiria tendência legítima em período silencioso.
export const DEFAULT_MAX_SAMPLE_GAP_MS = 45 * MINUTE;

const HIGH_COVERAGE_RATIO = 0.9;
const MODERATE_COVERAGE_RATIO = 0.6;

const INCIDENT_TRANSITIONS = ["listener_disconnected", "setup_required", "network_offline", "queue_backlog"];

export const evaluateCaptureCoverage = (samples, options = {}) => {
  const startsAt = Date.parse(options.startsAt ?? "");
  const endsAt = Date.parse(options.endsAt ?? "");
  const maxGap = options.maxSampleGapMs ?? DEFAULT_MAX_SAMPLE_GAP_MS;
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) {
    return coverageResult("unavailable", "invalid_window", { windowMs: 0, maxGap });
  }
  const windowMs = endsAt - startsAt;

  const normalized = (samples ?? [])
    .map((sample) => ({
      deviceId: String(sample.device_id ?? sample.deviceId ?? "unknown"),
      at: Date.parse(sample.observed_at ?? ""),
      status: sample.status ?? null,
      outboxPending: Number(sample.outbox_pending ?? 0),
      notificationAccess: sample.notification_access ?? null,
      listenerConnected: sample.listener_connected ?? null,
      whatsappInstalled: sample.whatsapp_installed ?? null,
      networkType: sample.network_type ?? null
    }))
    .filter((sample) => Number.isFinite(sample.at) && sample.at >= startsAt - maxGap && sample.at <= endsAt)
    .sort((a, b) => a.at - b.at);

  const inWindow = normalized.filter((sample) => sample.at >= startsAt);
  const devices = new Set(inWindow.map((sample) => sample.deviceId));
  const facts = {
    windowMs, maxGap,
    sampleCount: inWindow.length,
    deviceCount: devices.size,
    coveredMs: 0,
    largestGapMs: windowMs,
    configuration: "unknown",
    incidentCount: 0
  };
  if (inWindow.length === 0) return coverageResult("unavailable", "no_capture_samples", facts);

  const intervals = [];
  for (const deviceId of new Set(normalized.map((sample) => sample.deviceId))) {
    const series = normalized.filter((sample) => sample.deviceId === deviceId);
    for (let index = 1; index < series.length; index += 1) {
      const from = series[index - 1].at;
      const to = series[index].at;
      if (to - from > maxGap) continue;
      const clippedFrom = Math.max(from, startsAt);
      const clippedTo = Math.min(to, endsAt);
      if (clippedTo > clippedFrom) intervals.push([clippedFrom, clippedTo]);
    }
  }
  const merged = mergeIntervals(intervals);
  facts.coveredMs = merged.reduce((total, [from, to]) => total + (to - from), 0);
  facts.largestGapMs = largestUncovered(merged, startsAt, endsAt);

  facts.configuration = describeConfiguration(inWindow);
  const transitions = (options.transitions ?? []).filter((transition) => {
    const occurredAt = Date.parse(transition?.occurred_at ?? "");
    return Number.isFinite(occurredAt) && occurredAt >= startsAt && occurredAt <= endsAt
      && INCIDENT_TRANSITIONS.includes(transition.kind);
  });
  const sampleIncidents = inWindow.filter((sample) => sample.listenerConnected === false
    || sample.networkType === "offline" || sample.outboxPending > 0 || sample.status === "degraded");
  facts.incidentCount = transitions.length + sampleIncidents.length;

  if (facts.configuration === "not_configured") {
    return coverageResult("unavailable", "capture_not_configured", facts);
  }

  const ratio = facts.coveredMs / windowMs;
  let level;
  let reason;
  if (ratio >= HIGH_COVERAGE_RATIO && facts.largestGapMs <= maxGap) {
    level = "high";
    reason = "capture_covered_window";
  } else if (ratio >= MODERATE_COVERAGE_RATIO) {
    level = "moderate";
    reason = "partial_coverage";
  } else {
    level = "low";
    reason = ratio > 0 ? "sparse_coverage" : "no_demonstrable_continuity";
  }
  if (facts.incidentCount > 0 && level !== "low") {
    level = "low";
    reason = "capture_incident_in_window";
  }
  // Sem confirmação de que a captura está configurada, o teto é `moderate`,
  // por mais contínua que a série seja. O campo abaixo diz o que falta para
  // `high`, para que o teto não pareça um defeito silencioso.
  if (facts.configuration !== "confirmed" && level === "high") {
    return coverageResult("moderate", "configuration_not_reported", facts, {
      ceiling: "moderate",
      ceiling_reason: "o adaptador não reporta notification_access e whatsapp_installed"
    });
  }
  return coverageResult(level, reason, facts);
};

const describeConfiguration = (samples) => {
  if (samples.some((sample) => sample.notificationAccess === false || sample.whatsappInstalled === false)) {
    return "not_configured";
  }
  if (samples.some((sample) => sample.notificationAccess === true && sample.whatsappInstalled === true)) {
    return "confirmed";
  }
  return "unknown";
};

const mergeIntervals = (intervals) => {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [from, to] of sorted) {
    const last = merged.at(-1);
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
};

const largestUncovered = (merged, startsAt, endsAt) => {
  let largest = 0;
  let cursor = startsAt;
  for (const [from, to] of merged) {
    largest = Math.max(largest, from - cursor);
    cursor = Math.max(cursor, to);
  }
  return Math.max(largest, endsAt - cursor);
};

const coverageResult = (level, reason, facts, extra = {}) => ({
  level,
  reason,
  ...extra,
  trend_valid: level === "high" || level === "moderate",
  version: CAPTURE_COVERAGE_VERSION,
  coverage_ratio: facts.windowMs > 0 ? Math.round((facts.coveredMs / facts.windowMs) * 10_000) / 10_000 : 0,
  covered_seconds: Math.round(facts.coveredMs / 1000),
  window_seconds: Math.round(facts.windowMs / 1000),
  largest_gap_seconds: Math.round(facts.largestGapMs / 1000),
  max_sample_gap_seconds: Math.round(facts.maxGap / 1000),
  sample_count: facts.sampleCount,
  device_count: facts.deviceCount,
  incident_count: facts.incidentCount,
  configuration: facts.configuration
});
