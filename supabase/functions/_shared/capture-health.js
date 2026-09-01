// GENERATED from packages/capture-health/src/index.js — do not edit manually.
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
