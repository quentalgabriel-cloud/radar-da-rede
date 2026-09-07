import { createSupabaseProvider } from "./supabase-provider.js";
import { isEmailIdentifier, resolveLoginIdentifier } from "./auth-identity.js";
import { createRadarRefreshController } from "./refresh-controller.js";

const SCREENS = ["overview", "control", "situations", "groups", "health"];
const SCREEN_TITLES = {
  overview: "Radar",
  control: "Painel de controle",
  situations: "Situações",
  groups: "Grupos",
  health: "Captura"
};

const state = {
  config: null,
  data: null,
  manifest: null,
  mode: "lab",
  provider: null,
  refreshController: null,
  lastConsolidation: "",
  screen: "overview",
  query: "",
  controlQuery: "",
  scenario: null,
  severity: "all",
  preset: "all",
  groupCondition: "all",
  groupTrend: "all",
  groupStatus: "all",
  groupOrigin: "all",
  groupContext: "all",
  groupSort: "attention",
  controlGroups: new Map(),
  registryGroups: new Map(),
  drawerTrigger: null
};

const formatTime = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Recife" }).format(new Date(value))
  : "Ainda não informado";

const formatClock = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Recife" }).format(new Date(value))
  : null;

// "consolidado até 18:00" era ambíguo de madrugada: podia ser hoje ou ontem.
// A idade relativa diz a verdade sem depender de o leitor saber a data.
const describeAge = (value) => {
  const at = Date.parse(value ?? "");
  if (!Number.isFinite(at)) return "em momento não informado";
  const minutos = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (minutos < 2) return "agora há pouco";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h${String(minutos % 60).padStart(2, "0")} (${formatClock(value)})`;
  return `há mais de um dia (${formatClock(value)})`;
};

const describeDuration = (seconds) => {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 60) return `${total} s`;
  const minutos = Math.round(total / 60);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas}h${String(resto).padStart(2, "0")}`;
};

const windowDuration = (start, end) => {
  const inicio = Date.parse(start ?? "");
  const fim = Date.parse(end ?? "");
  return Number.isFinite(inicio) && Number.isFinite(fim) && fim > inicio
    ? describeDuration((fim - inicio) / 1000)
    : null;
};

const percentLabel = (ratio) => Number.isFinite(Number(ratio))
  ? `${Math.round(Number(ratio) * 100)}%`
  : null;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;"
})[character]);

const safeSeverity = (value) => new Set(["high", "medium", "low"]).has(value) ? value : "low";
const severityLabel = { high: "Atenção", medium: "Em acompanhamento", low: "Informativo" };
const activityLabel = { high: "Alta", medium: "Moderada", low: "Baixa" };
const conditionLabel = { critical: "Crítica", attention: "Atenção", watch: "Observação", normal: "Normal" };
const trendLabel = { growing: "Crescendo", stable: "Estável", declining: "Caindo", unavailable: "Sem comparação" };
const trendMetricLabel = {
  event_count: "Atividade",
  situation_count: "Situações no período",
  demand_count: "Demandas"
};
const captureLabel = {
  high: "alta", moderate: "moderada", low: "baixa", unavailable: "indisponível"
};
const windowKindLabel = {
  canonical_slot: "consolidação agendada",
  manual_refresh: "atualização manual",
  legacy_on_read: "janela antiga criada na leitura"
};
// Why a comparison is missing matters more than the fact that it is missing.
const trendReasons = {
  no_previous_run: "ainda não há uma execução anterior",
  no_run_at_previous_day_slot: "não há execução no mesmo horário do dia anterior",
  no_comparable_window: "não há janela de duração equivalente",
  current_window_is_not_a_canonical_slot: "a janela atual não é uma consolidação agendada",
  capture_confidence_insufficient: "a cobertura da captura não sustenta a comparação",
  comparison_unavailable: "sem janela comparadora",
  invalid_current_run: "a execução atual está inconsistente",
  no_current_run: "nenhuma execução disponível"
};
const trendReasonLabel = (reason) => trendReasons[reason] ?? reason;

// A cobertura é o fator que hoje mais limita a leitura. Cada motivo vira frase
// para que a operação saiba se o problema é do aparelho, da janela ou da fonte.
const coverageReasons = {
  capture_covered_window: "as amostras cobrem o período inteiro",
  partial_coverage: "as amostras cobrem parte do período",
  sparse_coverage: "as amostras deixam vãos longos dentro do período",
  no_demonstrable_continuity: "não há continuidade demonstrável no período",
  capture_incident_in_window: "houve interrupção de captura dentro do período",
  configuration_not_reported: "o aparelho não confirma a configuração da captura",
  capture_not_configured: "a captura não está configurada no aparelho",
  no_capture_samples: "não há amostras de saúde no período",
  invalid_window: "a janela informada é inválida",
  synthetic_scenario: "cenário de demonstração, sem cobertura medida",
  health_or_window_unavailable: "faltam dados de saúde ou de janela",
  health_fields_incomplete: "o aparelho não reporta todos os campos de saúde",
  heartbeat_does_not_cover_window: "o contato do aparelho é posterior ao início do período",
  listener_disconnected: "o sensor esteve desconectado",
  network_offline: "o aparelho esteve sem internet",
  queue_not_drained: "havia envios pendentes no aparelho",
  recovered_in_window: "a captura se recuperou dentro do período",
  adapter_degraded: "o aparelho reportou funcionamento degradado"
};
const coverageReasonLabel = (reason) => coverageReasons[reason] ?? reason ?? "motivo não informado";

const configurationLabel = {
  confirmed: "configuração confirmada",
  unknown: "configuração não reportada",
  not_configured: "captura não configurada"
};

const originLabel = {
  unknown: "Origem desconhecida",
  legacy: "Legado",
  current_operation: "Operação atual",
  synthetic: "Demonstração"
};

const contextTypeLabel = {
  territory: "Território", leadership: "Liderança", project: "Projeto", theme: "Tema",
  community: "Comunidade", event: "Evento", organic: "Rede orgânica", other: "Outro"
};

const registryLabel = (value) => ({
  unclassified: "Não classificado", partially_classified: "Classificação parcial", confirmed: "Confirmado",
  automatic: "Automático", ambiguous: "Revisar", rejected: "Rejeitado"
})[value] ?? value ?? "Não informado";

const plural = (value, singular, pluralForm) => `${value} ${value === 1 ? singular : pluralForm}`;

const scenarioLabel = (name) => state.manifest?.scenarios
  .find((scenario) => scenario.name === name)?.label ?? "Cenário de demonstração";

// O read model já traz um veredito de captura em camadas (aparelho, captura,
// sincronização) com a próxima ação. Recalcular isso na tela produziria duas
// verdades; a apresentação prefere o veredito e só cai no status cru quando ele
// não existe, como no laboratório sintético.
const healthPresentation = (health) => {
  const evaluation = health?.evaluation;
  if (evaluation?.label) {
    return {
      level: evaluation.level ?? "warning",
      label: evaluation.label,
      detail: evaluation.summary ?? "",
      action: evaluation.next_action ?? null,
      humanAction: evaluation.human_action_required === true,
      layers: evaluation.layers ?? null
    };
  }
  const groups = state.data?.overview?.conversation_count ?? 0;
  if (health.status === "healthy") {
    return {
      level: "ok",
      label: "Captura normal",
      detail: `${plural(groups, "grupo acompanhado", "grupos acompanhados")}. Última atualização: ${formatTime(health.observed_at)}.`
    };
  }
  if (health.status === "degraded") {
    return {
      level: "warning",
      label: "Cobertura parcial",
      detail: "A rede está enviando dados, mas parte da captura pode estar atrasada ou incompleta."
    };
  }
  if (health.status === "offline_recovery") {
    return {
      level: "warning",
      label: "Captura restabelecida",
      detail: "A captura voltou a funcionar após uma interrupção. Os dados pendentes estão sendo recuperados."
    };
  }
  return {
    level: "critical",
    label: "Captura sem confirmação",
    detail: `Não recebemos uma atualização recente. Último dado conhecido: ${formatTime(health.observed_at)}.`
  };
};

const renderStatusBlock = (selector) => {
  const status = healthPresentation(state.data.health);
  document.querySelector(selector).innerHTML = `
    <span class="status-dot ${escapeHtml(status.level)}" aria-hidden="true"></span>
    <div><strong>${escapeHtml(status.label)}</strong><p>${escapeHtml(status.detail)}</p></div>
  `;
};

const situationCard = (item, index, compact = false) => {
  const severity = safeSeverity(item.severity);
  const conversationCount = item.conversation_count ?? new Set((item.evidence ?? []).map((evidence) => evidence.conversation)).size;
  const mentionCount = item.mention_count ?? item.evidence?.length ?? 0;
  const territories = item.territories ?? [...new Set((item.evidence ?? []).map((evidence) => evidence.territory).filter(Boolean))];
  const explanation = item.explanation ?? [
    `${plural(mentionCount, "atividade relacionada", "atividades relacionadas")} no período.`,
    `${plural(conversationCount, "grupo envolvido", "grupos envolvidos")}.`
  ];
  return `
    <article class="situation-card ${severity}">
      <header>
        <span class="severity-pill ${severity}">${severityLabel[severity]}</span>
        <span class="situation-status">${item.status === "resolved" ? "Resolvido" : "No período"}</span>
      </header>
      <h3>${escapeHtml(item.title)}</h3>
      <p class="situation-reason">${escapeHtml(item.reason)}</p>
      <div class="situation-meta">
        <span>${escapeHtml(plural(conversationCount, "grupo", "grupos"))}</span>
        <span>${escapeHtml(plural(territories.length, "território", "territórios"))}</span>
        <span>Desde ${escapeHtml(formatTime(item.first_seen_at))}</span>
      </div>
      ${compact ? `
        <button class="text-button" type="button" data-open-situation="${index}">Entender o que está acontecendo</button>
      ` : `
        <div class="situation-grid">
          <div><span>Onde</span><strong>${escapeHtml(territories.join(", ") || "Ainda não informado")}</strong></div>
          <div><span>Intensidade</span><strong>${escapeHtml(plural(mentionCount, "atividade", "atividades"))}</strong></div>
          <div><span>Última ocorrência</span><strong>${escapeHtml(formatTime(item.last_seen_at))}</strong></div>
        </div>
        <details class="explanation">
          <summary>Por que isso apareceu?</summary>
          <ul>${explanation.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
        </details>
        <details class="evidence">
          <summary>Ver mensagens relacionadas</summary>
          <div>${(item.evidence ?? []).map((evidence) => `
            <blockquote class="evidence-item">
              <header><strong>${escapeHtml(evidence.conversation)}</strong><span>${escapeHtml(formatTime(evidence.occurred_at))}</span></header>
              <p>“${escapeHtml(evidence.text)}”</p>
            </blockquote>
          `).join("") || '<p class="empty">As mensagens relacionadas ainda não estão disponíveis.</p>'}</div>
        </details>
      `}
    </article>
  `;
};

const renderOverview = () => {
  const { overview, attention = [], movements = [], territories = [], recent_events: recentEvents = [] } = state.data;
  const sourceKind = state.data.scenario.synthetic ? "Demonstração com dados simulados" : "Rede conectada";
  const sourceName = state.data.scenario.synthetic ? scenarioLabel(state.data.scenario.name) : "Rede em tempo real";
  document.querySelector("#source-label").textContent = `${sourceName} · ${sourceKind}`;
  document.querySelector("#overview-title").textContent = overview.alert_count > 0
    ? `${plural(overview.alert_count, "situação merece", "situações merecem")} atenção`
    : "Nenhuma situação urgente agora";
  // Um "0" num selo vermelho permanente contradiz o título ao lado dele.
  const alertBadge = document.querySelector("#alert-count");
  alertBadge.hidden = overview.alert_count === 0;
  alertBadge.textContent = overview.alert_count;
  alertBadge.setAttribute("aria-label", plural(overview.alert_count, "situação prioritária", "situações prioritárias"));
  renderStatusBlock("#network-status");

  document.querySelector("#metric-grid").innerHTML = [
    [overview.conversation_count, "grupos acompanhados"],
    [overview.alert_count, "situações no período"],
    [overview.territory_count ?? territories.length, "territórios com atividade"],
    [overview.event_count, "atividades observadas"]
  ].map(([value, label]) => `<div class="metric"><strong>${escapeHtml(value)}</strong><span>${label}</span></div>`).join("");

  document.querySelector("#attention-list").innerHTML = attention.length === 0
    ? '<div class="empty-state"><strong>Nenhuma situação relevante detectada até agora.</strong><span>O Radar continua acompanhando a rede.</span></div>'
    : attention.slice(0, 3).map((item, index) => situationCard(item, index, true)).join("");

  document.querySelector("#movement-list").innerHTML = movements.length === 0
    ? '<div class="empty-state"><strong>Nenhum movimento relevante no período.</strong><span>Ainda não há dados suficientes para destacar um assunto.</span></div>'
    : movements.slice(0, 5).map((movement) => {
      const severity = safeSeverity(movement.severity);
      return `
        <article class="movement-card">
          <div class="movement-heading">
            <div><span class="topic-label">${escapeHtml(movement.label)}</span><strong>${severity === "high" ? "Presença forte" : severity === "medium" ? "Em movimento" : "Atividade observada"}</strong></div>
            <span class="trend ${severity}">→</span>
          </div>
          <p>${escapeHtml(movement.summary ?? `${plural(movement.mention_count, "menção", "menções")} em ${plural(movement.conversation_count, "grupo", "grupos")}.`)}</p>
          <div class="movement-meta"><span>${escapeHtml(plural(movement.conversation_count, "grupo", "grupos"))}</span><span>${escapeHtml(plural(movement.territory_count ?? 0, "território", "territórios"))}</span></div>
        </article>
      `;
    }).join("");

  document.querySelector("#territory-list").innerHTML = territories.length === 0
    ? '<p class="empty">Ainda não há território informado para este período.</p>'
    : territories.slice(0, 6).map((territory) => `
      <article class="territory-card">
        <header><strong>${escapeHtml(territory.label)}</strong><span>${escapeHtml(plural(territory.open_situation_count, "situação no período", "situações no período"))}</span></header>
        <div class="topic-list">${territory.topics.length > 0
          ? territory.topics.map((topic) => `<span>→ ${escapeHtml(topic.label)}</span>`).join("")
          : "<span>Atividade sem assunto classificado</span>"}</div>
      </article>
    `).join("");

  document.querySelector("#recent-list").innerHTML = recentEvents.length === 0
    ? '<p class="empty">Nenhuma atividade recente disponível.</p>'
    : recentEvents.slice(0, 3).map((event) => `
      <article class="event-card">
        <header><strong>${escapeHtml(event.conversation)}</strong><span>${escapeHtml(formatTime(event.occurred_at))}</span></header>
        <p>${escapeHtml(event.text)}</p>
      </article>
    `).join("");
};

const renderSituations = () => {
  const attention = state.data.attention ?? [];
  const filtered = state.severity === "all"
    ? attention
    : attention.filter((item) => safeSeverity(item.severity) === state.severity);
  document.querySelector("#situation-list").innerHTML = filtered.length === 0
    ? '<div class="empty-state"><strong>Nenhuma situação neste filtro.</strong><span>Isso pode mudar conforme novas atividades chegarem.</span></div>'
    : filtered.map((item, index) => situationCard(item, index)).join("");
};

// ── Painel de controle ──────────────────────────────────────────────────────

const PRESETS = {
  all: () => true,
  attention: (group) => ["attention", "critical"].includes(group.condition),
  active: (group) => group.event_count > 0,
  inactive: (group) => group.event_count === 0,
  growing: (group) => group.trend?.direction === "growing",
  declining: (group) => group.trend?.direction === "declining",
  unclassified: (group) => group.classification_status !== "confirmed"
};

// A série já chega filtrada às janelas que a política aceitaria comparar, então
// o traço entre dois pontos não afirma nada que a engine recuse. Com menos de
// duas janelas não há linha: um ponto isolado insinuaria uma leitura que não
// existe. O texto do <title> é a fonte primária para leitor de tela.
const sparkline = (points, { width = 92, height = 26 } = {}) => {
  const values = (points ?? []).map((point) => Number(point?.value ?? 0)).filter(Number.isFinite);
  if (values.length < 2) return "";
  const maximum = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const position = (value) => (height - 2 - (value / maximum) * (height - 4)).toFixed(1);
  const path = values.map((value, index) => `${index === 0 ? "M" : "L"}${(index * step).toFixed(1)} ${position(value)}`).join(" ");
  const descricao = values.every((value) => value === 0)
    ? `Sem atividade nas últimas ${values.length} janelas comparáveis.`
    : `Atividade nas últimas ${values.length} janelas comparáveis: ${values.join(", ")}.`;
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" role="img">
    <title>${escapeHtml(descricao)}</title><path d="${path}"/><circle cx="${width}" cy="${position(values.at(-1))}" r="2.4"/>
  </svg>`;
};

const trendChip = (trend) => {
  const direction = trend?.direction ?? "unavailable";
  const texto = direction === "unavailable"
    ? `Sem comparação · ${trendReasonLabel(trend?.unavailable_reason)}`
    : `${trendLabel[direction]}${trend?.delta == null ? "" : ` · ${trend.delta > 0 ? "+" : ""}${trend.delta}`}`;
  return `<span class="trend-chip ${escapeHtml(direction)}">${escapeHtml(texto)}</span>`;
};

const classificationChip = (status) => `<span class="classification-chip ${status === "confirmed" ? "confirmed" : ""}">${escapeHtml(registryLabel(status))}</span>`;

// Um número sem o período a que pertence não é sinal operacional, e uma
// tendência sem cobertura é palpite. Este bloco existe para que a operação veja,
// antes da lista, qual janela está na tela e o quanto ela é sustentada.
const renderControlCenterAnchor = (controlCenter) => {
  const target = document.querySelector("#control-center-anchor");
  if (!target) return;
  const anchor = controlCenter.anchor ?? {};
  const consistency = controlCenter.consistency ?? {};
  if (!anchor.current_run_id) {
    target.innerHTML = '<p class="anchor-note">Nenhuma consolidação disponível. O Control Center não tem janela para exibir.</p>';
    return;
  }
  const duracao = windowDuration(anchor.current_window_start, anchor.current_window_end);
  const tipo = windowKindLabel[anchor.window_kind ?? state.data?.freshness?.window_kind] ?? null;
  const zeros = Number(consistency.synthesized_zero_count ?? 0);
  const comparison = anchor.comparison_run_id
    ? `${formatTime(anchor.comparison_window_start)} → ${formatTime(anchor.comparison_window_end)}`
    : `Sem comparação: ${trendReasonLabel(anchor.comparison_unavailable_reason)}.`;
  const overlap = anchor.windows_overlap
    ? '<p class="confidence-warning">As janelas comparadas se sobrepõem; a diferença não deve ser lida como tendência.</p>'
    : "";
  const partial = consistency.consistent === false
    ? '<p class="confidence-warning">A execução atual está inconsistente entre grupos monitorados e métricas persistidas.</p>'
    : "";
  // A frase completa vive aqui, uma vez. Repeti-la em cada cartão empurrava o
  // dado do grupo para fora da tela quando a tendência está desligada em todos.
  const semTendencia = Number(controlCenter.summary?.trend_unavailable ?? 0);
  const monitorados = Number(controlCenter.summary?.monitored ?? 0);
  const semComparacao = semTendencia > 0 && semTendencia === monitorados
    ? `<p class="confidence-warning">Nenhum dos ${escapeHtml(monitorados)} grupos tem tendência nesta execução: ${escapeHtml(trendReasonLabel(controlCenter.groups?.[0]?.trend?.unavailable_reason ?? anchor.comparison_unavailable_reason))}.</p>`
    : "";
  target.innerHTML = `
    <div class="anchor-grid">
      <div class="anchor-line">
        <span>Janela atual</span>
        <strong>${escapeHtml(formatTime(anchor.current_window_start))} → ${escapeHtml(formatTime(anchor.current_window_end))}${duracao ? ` · ${escapeHtml(duracao)}` : ""}${tipo ? ` · ${escapeHtml(tipo)}` : ""}</strong>
        <span>Comparação</span>
        <strong>${escapeHtml(comparison)}</strong>
        <strong class="anchor-policy">Política: ${escapeHtml(anchor.comparison_policy ?? "não informada")}</strong>
      </div>
      ${coverageBlock(controlCenter)}
    </div>
    <p class="anchor-note">${escapeHtml(zeros)} de ${escapeHtml(consistency.monitored_group_count ?? 0)} grupos monitorados ficaram sem atividade nesta execução. O zero pertence a esta janela e não reaproveita uma medição anterior.</p>
    ${semComparacao}${overlap}${partial}`;
};

// O nível e o motivo são o texto principal; a percentagem é apoio. Com 8
// interrupções na janela o motor rebaixa a cobertura para "baixa" mesmo com 60%
// medidos, e uma barra quase pela metade lida como quase suficiente mentiria
// sobre o veredito. Cobertura ausente é dita como ausente, nunca como zero: um
// rollback de RPC ou uma falha de leitura de saúde entrega `{ level }` sozinho,
// e "0% coberto" seria uma afirmação que ninguém mediu.
const coverageBlock = (controlCenter) => {
  const capture = controlCenter.capture ?? null;
  const nivel = capture?.level ?? "unavailable";
  const rotulo = captureLabel[nivel] ?? nivel;
  const proporcao = Number(capture?.coverage_ratio);
  const medida = capture != null && Number.isFinite(proporcao);
  const consequencia = capture?.trend_valid === true
    ? "A cobertura sustenta a comparação entre janelas."
    : "Com esta cobertura, a tendência fica indisponível — a diferença entre janelas não é confiável.";
  const motivo = capture?.reason ? `Motivo: ${coverageReasonLabel(capture.reason)}.` : "";
  if (!medida) {
    return `<div class="coverage">
      <div class="coverage-head"><strong>Cobertura da captura: ${escapeHtml(rotulo)}</strong><span>não medida</span></div>
      <p class="coverage-consequence">${escapeHtml(motivo)} Esta execução não registrou a cobertura do período, então a barra fica sem valor — o que é diferente de cobertura zero. ${escapeHtml(consequencia)}</p>
    </div>`;
  }
  const largura = Math.max(0, Math.min(100, Math.round(proporcao * 100)));
  const fatos = [
    `${percentLabel(proporcao)} do período com evidência de captura`,
    Number.isFinite(Number(capture.largest_gap_seconds)) ? `maior lacuna ${describeDuration(capture.largest_gap_seconds)}` : null,
    Number.isFinite(Number(capture.sample_count)) ? plural(Number(capture.sample_count), "amostra", "amostras") : null,
    Number.isFinite(Number(capture.device_count)) ? plural(Number(capture.device_count), "aparelho", "aparelhos") : null,
    Number(capture.incident_count) > 0 ? plural(Number(capture.incident_count), "interrupção", "interrupções") : null,
    capture.configuration ? configurationLabel[capture.configuration] ?? capture.configuration : null
  ].filter(Boolean);
  const teto = capture.ceiling
    ? ` O nível não passa de ${captureLabel[capture.ceiling] ?? capture.ceiling} porque ${capture.ceiling_reason ?? "falta evidência de configuração"}.`
    : "";
  return `<div class="coverage">
    <div class="coverage-head"><strong>Cobertura da captura: ${escapeHtml(rotulo)}</strong><span>${escapeHtml(percentLabel(proporcao))} medidos</span></div>
    <div class="coverage-track"><span class="coverage-fill ${escapeHtml(nivel)}" style="width: ${largura}%"></span></div>
    <div class="coverage-facts">${fatos.map((fato) => `<span>${escapeHtml(fato)}</span>`).join("")}</div>
    <p class="coverage-consequence">${escapeHtml(motivo)} ${escapeHtml(consequencia)}${escapeHtml(teto)}</p>
  </div>`;
};

const renderControlSummary = (summary) => {
  const chips = [
    ["all", summary.monitored ?? 0, "monitorados"],
    ["active", summary.active ?? 0, "com atividade"],
    ["attention", summary.attention ?? 0, "em atenção"],
    ["inactive", summary.inactive ?? Math.max(0, (summary.monitored ?? 0) - (summary.active ?? 0)), "sem atividade"],
    ["unclassified", summary.unclassified ?? 0, "não classificados"]
  ];
  document.querySelector("#control-center-summary").innerHTML = chips.map(([preset, value, label]) => `
    <button class="summary-chip" type="button" data-preset="${escapeHtml(preset)}" aria-pressed="${state.preset === preset}">
      <strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span>
    </button>`).join("");
};

const populateControlFilter = (selector, values, selected) => {
  const select = document.querySelector(selector);
  const first = select.options[0].outerHTML;
  select.innerHTML = first + values.sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  select.value = values.includes(selected) ? selected : "all";
};

const renderControlCenter = () => {
  const controlCenter = state.data?.group_control_center;
  const enabled = controlCenter?.enabled === true;
  document.querySelector("#control-center").hidden = !enabled;
  document.querySelector("#control-unavailable").hidden = enabled;
  if (!enabled) return;

  renderControlCenterAnchor(controlCenter);
  renderControlSummary(controlCenter.summary ?? {});

  const todos = controlCenter.groups ?? [];
  state.controlGroups = new Map(todos.map((group) => [group.id, group]));
  populateControlFilter("#origin-filter", [...new Set(todos.map((group) => group.origin).filter(Boolean))], state.groupOrigin);
  populateControlFilter("#context-filter", [...new Set(todos.map((group) => group.context?.label).filter(Boolean))], state.groupContext);

  const query = state.controlQuery.toLocaleLowerCase("pt-BR");
  const preset = PRESETS[state.preset] ?? PRESETS.all;
  const conditionWeight = { critical: 4, attention: 3, watch: 2, normal: 1 };
  const directionDelta = (group) => Number(group.trend?.delta ?? 0);
  const groups = todos.filter((group) => {
    const matchesQuery = [group.label, group.context?.label, group.context?.territory, group.context?.municipality]
      .some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(query));
    const matchesStatus = state.groupStatus === "all"
      || (state.groupStatus === "active" && group.event_count > 0)
      || (state.groupStatus === "inactive" && group.event_count === 0)
      || (state.groupStatus === "unclassified" && group.classification_status !== "confirmed");
    return matchesQuery && preset(group) && matchesStatus
      && (state.groupCondition === "all" || group.condition === state.groupCondition)
      && (state.groupTrend === "all" || group.trend?.direction === state.groupTrend)
      && (state.groupOrigin === "all" || group.origin === state.groupOrigin)
      && (state.groupContext === "all" || group.context?.label === state.groupContext);
  }).sort((a, b) => {
    if (state.groupSort === "decline") return directionDelta(a) - directionDelta(b);
    if (state.groupSort === "growth") return directionDelta(b) - directionDelta(a);
    if (state.groupSort === "activity") return b.event_count - a.event_count;
    if (state.groupSort === "recent") return Date.parse(b.last_seen_at ?? 0) - Date.parse(a.last_seen_at ?? 0);
    // Sem alerta na janela toda a rede fica "normal" e os dois primeiros
    // critérios empatam. A atividade é o desempate que faz o grupo com 556
    // eventos aparecer antes dos que não tiveram nenhum.
    return (conditionWeight[b.condition] ?? 0) - (conditionWeight[a.condition] ?? 0)
      || b.situation_count - a.situation_count
      || b.event_count - a.event_count;
  });

  document.querySelector("#control-group-list").innerHTML = groups.length === 0
    ? emptyControlState(controlCenter)
    : groups.map(controlGroupCard).join("");
};

// Um filtro de tendência vazio não é "ajuste a busca": é a cobertura desligando
// a comparação. Dizer isso evita que a operação procure um grupo que não existe.
const emptyControlState = (controlCenter) => {
  const semTendencia = ["growing", "declining", "stable"].includes(state.preset)
    || ["growing", "declining", "stable"].includes(state.groupTrend);
  const todosSemComparacao = Number(controlCenter.summary?.trend_unavailable ?? 0) === Number(controlCenter.summary?.monitored ?? 0);
  if (semTendencia && todosSemComparacao) {
    return `<div class="empty-state"><strong>Nenhum grupo tem tendência nesta execução.</strong>
      <span>${escapeHtml(trendReasonLabel(controlCenter.anchor?.comparison_unavailable_reason ?? "capture_confidence_insufficient"))}. Enquanto isso, use os recortes de atividade e classificação.</span></div>`;
  }
  return '<div class="empty-state"><strong>Nenhum grupo neste filtro.</strong><span>Ajuste busca, recorte ou filtros avançados.</span></div>';
};

// Os avisos longos de zero e de cobertura saíram do cartão para a âncora, onde
// aparecem uma vez. No cartão fica o rótulo curto — a afirmação continua presa à
// execução atual, sem repetir o mesmo parágrafo em cada linha da lista.
const controlGroupCard = (group) => {
  const situationCount = group.situation_count ?? group.open_situation_count ?? 0;
  const contexto = group.context?.label || originLabel[group.origin] || "Contexto não informado";
  return `<article class="group-card control-card condition-${escapeHtml(group.condition)}">
    <div class="group-card-head">
      <button class="card-open" type="button" data-open-group="${escapeHtml(group.id)}">
        <span class="card-open-text"><strong>${escapeHtml(group.label)}</strong><span>${escapeHtml(contexto)}</span></span>
        <span class="condition-badge ${escapeHtml(group.condition)}">${escapeHtml(conditionLabel[group.condition] ?? group.condition)}</span>
      </button>
    </div>
    <div class="card-metrics">
      <span class="figure"><strong>${escapeHtml(group.event_count)}</strong><span>Atividades</span></span>
      <span class="figure"><strong>${escapeHtml(situationCount)}</strong><span>Situações no período</span></span>
      ${trendChip(group.trend)}
      ${group.metric_source === "synthesized_zero" ? '<span class="trend-chip unavailable">Sem atividade nesta execução</span>' : ""}
      ${classificationChip(group.classification_status)}
      ${sparkline(group.sparkline)}
    </div>
    <div class="card-metrics">
      <span class="figure"><span>Visto pela última vez: ${escapeHtml(formatTime(group.last_seen_at))}</span></span>
    </div>
  </article>`;
};

// ── Detalhe do grupo ────────────────────────────────────────────────────────

const registryEntry = (groupId) => state.registryGroups.get(groupId) ?? null;

const classificationForm = (group, registry) => {
  if (!registry) {
    return '<p class="notice">A classificação de grupos existe na rede conectada. A demonstração não altera cadastro.</p>';
  }
  if (registry.can_manage !== true) {
    return '<p class="notice">Você pode consultar esta classificação. Alterações são restritas à gestão da rede.</p>';
  }
  const entry = registryEntry(group.id) ?? {};
  const options = (values, selected, labeller) => values.map((value) =>
    `<option value="${escapeHtml(value)}"${value === (selected ?? "") ? " selected" : ""}>${escapeHtml(labeller(value))}</option>`).join("");
  return `<form class="registry-form" data-group-id="${escapeHtml(group.id)}">
    <label>Origem<select name="origin">${options(["unknown", "legacy", "current_operation"], entry.origin ?? "unknown", (value) => originLabel[value] ?? value)}</select></label>
    <label>Tipo de contexto<select name="context_type"><option value=""${entry.context_type ? "" : " selected"}>Não informado</option>${options(["territory", "leadership", "project", "theme", "community", "event", "organic", "other"], entry.context_type, (value) => contextTypeLabel[value] ?? value)}</select></label>
    <label>Nome do contexto<input name="context_label" value="${escapeHtml(entry.context_label ?? "")}" maxlength="255" placeholder="Ex.: Peixinhos, Equipe da Rosa, Agentes ambientais"></label>
    <label>Município<input name="municipality" value="${escapeHtml(entry.municipality ?? "")}" maxlength="160"></label>
    <label>Território<input name="territory" value="${escapeHtml(entry.territory ?? "")}" maxlength="160"></label>
    <label>Referência operacional<input name="primary_steward_label" value="${escapeHtml(entry.primary_steward_label ?? "")}" maxlength="160"></label>
    <label>Classificação<select name="classification_status">${options(["unclassified", "partially_classified", "confirmed"], entry.classification_status ?? "unclassified", registryLabel)}</select></label>
    <button class="primary-button" type="submit">Salvar classificação</button><span class="registry-message" role="status"></span>
  </form>`;
};

const drawerGroup = (groupId) => {
  const control = state.controlGroups.get(groupId);
  if (control) return control;
  const entry = registryEntry(groupId);
  if (!entry) return null;
  return {
    id: entry.id,
    label: entry.current_label,
    origin: entry.origin,
    context: {
      type: entry.context_type, label: entry.context_label,
      municipality: entry.municipality, territory: entry.territory, steward: entry.primary_steward_label
    },
    classification_status: entry.classification_status,
    condition: null,
    trend: null,
    trends: null,
    event_count: null,
    situation_count: null,
    metric_source: "unavailable",
    last_seen_at: entry.last_seen_at,
    capture_confidence: "unavailable",
    topics: [],
    sparkline: []
  };
};

const openGroupDrawer = (groupId, trigger = null) => {
  const group = drawerGroup(groupId);
  if (!group) return;
  const registry = state.data?.group_registry ?? null;
  const aliases = (registry?.aliases ?? []).filter((alias) => alias.group_id === group.id);
  const changes = (registry?.changes ?? []).filter((change) => change.group_id === group.id);
  const evidence = (state.data?.recent_events ?? []).filter((event) => event.conversation === group.label).slice(0, 4);
  const trends = group.trends ?? (group.trend ? { event_count: group.trend } : null);
  const contexto = [
    group.context?.label,
    group.context?.municipality,
    group.context?.territory,
    group.context?.steward
  ].filter(Boolean).join(" · ") || "Contexto ainda não informado";

  document.querySelector("#group-drawer-eyebrow").textContent = originLabel[group.origin] ?? "Grupo";
  document.querySelector("#group-drawer-title").textContent = group.label;
  document.querySelector("#group-drawer-content").innerHTML = `
    <section class="drawer-section"><h3>Leitura atual</h3>
      <div class="subgrid">
        <div><span>Condição</span><strong>${escapeHtml(group.condition ? conditionLabel[group.condition] ?? group.condition : "Sem métrica nesta janela")}</strong></div>
        <div><span>Atividade</span><strong>${escapeHtml(group.event_count ?? "não medida")}</strong></div>
        <div><span>Situações no período</span><strong>${escapeHtml(group.situation_count ?? 0)}</strong></div>
        <div><span>Última atividade</span><strong>${escapeHtml(formatTime(group.last_seen_at))}</strong></div>
      </div>
      ${group.metric_source === "synthesized_zero" ? '<p class="confidence-warning">Sem atividade nesta execução. O zero pertence à janela atual e não reaproveita uma medição anterior.</p>' : ""}
    </section>
    <section class="drawer-section"><h3>Crescimento, estabilidade e queda</h3>
      ${trends
        ? Object.entries(trends).map(([nome, trend]) => `<p class="anchor-note"><strong>${escapeHtml(trendMetricLabel[nome] ?? nome)}:</strong> ${trendChip(trend)}</p>`).join("")
        : '<p class="anchor-note">Este grupo ainda não tem métrica na execução atual.</p>'}
    </section>
    <section class="drawer-section"><h3>Ritmo por janela</h3>
      ${sparkline(group.sparkline, { width: 280, height: 44 })
        || '<p class="anchor-note">Ainda não há duas janelas comparáveis para desenhar o histórico.</p>'}
      <p class="anchor-note">${(group.sparkline ?? []).map((point) => `${escapeHtml(formatTime(point.at))}: ${escapeHtml(point.value)}`).join("<br>") || ""}</p>
    </section>
    <section class="drawer-section"><h3>Assuntos observados</h3>
      <div class="tag-list">${(group.topics ?? []).map((topic) => `<span>${escapeHtml(topic.label)} · ${escapeHtml(topic.count)}</span>`).join("") || "<span>Sem assunto classificado</span>"}</div>
    </section>
    <section class="drawer-section"><h3>Confiança da captura</h3>
      <p>${escapeHtml(captureLabel[group.capture_confidence] ?? group.capture_confidence)}. A confiança mede a cobertura observada do período; tendências ficam indisponíveis quando a janela atual ou a comparadora não têm cobertura suficiente.</p>
    </section>
    <section class="drawer-section"><h3>Classificação</h3>
      <p>${escapeHtml(contexto)}</p>
      ${classificationForm(group, registry)}
      ${registry ? `<details><summary>Aliases observados (${aliases.length})</summary><div>${aliases.map((alias) => `
        <div class="alias-row"><span>${escapeHtml(alias.observed_label)} · ${escapeHtml(registryLabel(alias.resolution_status))}</span>${registry.can_manage && alias.resolution_status === "ambiguous"
          ? `<button type="button" data-review-alias="${escapeHtml(alias.id)}" data-resolution="confirmed">Confirmar</button><button type="button" data-review-alias="${escapeHtml(alias.id)}" data-resolution="rejected">Rejeitar</button>`
          : ""}</div>`).join("") || "Nenhum alias."}</div></details>
      <details><summary>Histórico de classificação (${changes.length})</summary><div>${changes.map((change) => `<p class="anchor-note">${escapeHtml(formatTime(change.changed_at))}: ${escapeHtml(change.field_name)}</p>`).join("") || "Nenhuma alteração manual."}</div></details>` : ""}
    </section>
    <section class="drawer-section"><h3>Evidência</h3>
      <p class="anchor-note">Mensagens observadas com este nome na janela carregada. O vínculo é pelo rótulo do grupo, não pelo identificador resolvido.</p>
      ${evidence.map((event) => `<blockquote class="evidence-item"><header><strong>${escapeHtml(event.conversation)}</strong><span>${escapeHtml(formatTime(event.occurred_at))}</span></header><p>“${escapeHtml(event.text)}”</p></blockquote>`).join("")
        || '<p class="anchor-note">Nenhuma mensagem com este nome está disponível na janela carregada.</p>'}
    </section>`;
  state.drawerTrigger = trigger;
  document.querySelector("#group-drawer").showModal();
};

// ── Grupos: repositório e identidade ────────────────────────────────────────

const renderGroups = () => {
  const query = state.query.toLocaleLowerCase("pt-BR");
  const registry = state.data?.group_registry;
  const temRegistry = state.mode === "live" && Boolean(registry);
  document.querySelector("#group-registry").hidden = !temRegistry;
  document.querySelector("#conversation-list").hidden = temRegistry;
  if (temRegistry) renderGroupRegistry(registry, query);
  else renderConversationList(query);
};

const renderConversationList = (query) => {
  const conversations = (state.data.conversations ?? []).filter((conversation) =>
    [conversation.label, conversation.territory, ...(conversation.topics ?? [])]
      .some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(query))
  );
  document.querySelector("#conversation-list").innerHTML = conversations.length === 0
    ? '<div class="empty-state"><strong>Nenhum grupo encontrado.</strong><span>Tente buscar por outro nome, território ou assunto.</span></div>'
    : conversations.map((conversation) => {
      const events = (state.data.recent_events ?? []).filter((event) => event.conversation === conversation.label);
      return `
        <details class="group-card">
          <summary>
            <div>
              <strong>${escapeHtml(conversation.label)}</strong>
              <span>${escapeHtml(conversation.territory || "Território não informado")}</span>
            </div>
            <span class="activity-pill ${escapeHtml(conversation.activity ?? "low")}">Atividade ${activityLabel[conversation.activity] ?? "Baixa"}</span>
          </summary>
          <div class="group-body">
            <dl>
              <div><dt>Última atividade</dt><dd>${escapeHtml(formatTime(conversation.last_seen_at))}</dd></div>
              <div><dt>Situações no período</dt><dd>${escapeHtml(conversation.open_situation_count ?? 0)}</dd></div>
            </dl>
            <div class="tag-list">${(conversation.topics ?? []).map((topic) => `<span>${escapeHtml(topic)}</span>`).join("") || "<span>Sem assunto classificado</span>"}</div>
            <h3>Trecho da conversa</h3>
            <div class="timeline">${events.slice().reverse().map((event) => `
              <div class="timeline-item"><time>${escapeHtml(formatTime(event.occurred_at))}</time><p>“${escapeHtml(event.text)}”</p></div>
            `).join("") || '<p class="empty">Ainda não há mensagens disponíveis.</p>'}</div>
            ${conversation.open_situation_count > 0 ? `<div class="radar-note"><strong>Radar identificou</strong><span>${escapeHtml(plural(conversation.open_situation_count, "situação registrada no período", "situações registradas no período"))} neste grupo.</span></div>` : ""}
          </div>
        </details>
      `;
    }).join("");
};

const renderGroupRegistry = (registry, query) => {
  const summary = registry.summary ?? {};
  const todos = registry.groups ?? [];
  const ativos = todos.filter((group) => group.status !== "archived");
  const arquivados = todos.length - ativos.length;
  const confirmados = ativos.filter((group) => group.classification_status === "confirmed").length;
  const proporcao = ativos.length > 0 ? confirmados / ativos.length : 0;
  const ambiguos = (registry.aliases ?? []).filter((alias) => alias.resolution_status === "ambiguous").length;

  document.querySelector("#registry-progress").innerHTML = `
    <div class="coverage-head"><strong>Classificação dos grupos</strong><span>${escapeHtml(percentLabel(proporcao))}</span></div>
    <div class="coverage-track"><span class="coverage-fill ${proporcao >= 0.8 ? "" : proporcao >= 0.4 ? "moderate" : "low"}" style="width: ${Math.round(proporcao * 100)}%"></span></div>
    <p class="coverage-consequence">${escapeHtml(confirmados)} de ${escapeHtml(ativos.length)} grupos ativos com contexto confirmado. Classificar é o que permite ler a rede por território, liderança, projeto ou tema.</p>`;

  document.querySelector("#registry-summary").textContent = [
    `${summary.groups ?? ativos.length} grupos no cadastro`,
    `${ambiguos} aliases para revisar`,
    arquivados > 0 ? `${arquivados} arquivados pela consolidação de identidade` : null
  ].filter(Boolean).join(" · ");

  const groups = ativos.filter((group) => [group.current_label, group.territory, group.municipality, group.context_label, group.primary_steward_label]
    .some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(query)));
  document.querySelector("#registry-list").innerHTML = groups.length === 0
    ? '<div class="empty-state"><strong>Nenhum grupo do cadastro encontrado.</strong><span>Tente buscar por outro nome, contexto ou responsável.</span></div>'
    : groups.map((group) => {
      const aliases = (registry.aliases ?? []).filter((alias) => alias.group_id === group.id);
      const contexto = [group.context_label, group.municipality, group.territory].filter(Boolean).join(" · ")
        || "Contexto ainda não informado";
      return `<article class="group-card registry-card">
        <div class="group-card-head">
          <button class="card-open" type="button" data-open-group="${escapeHtml(group.id)}">
            <span class="card-open-text"><strong>${escapeHtml(group.current_label)}</strong><span>${escapeHtml(contexto)}</span></span>
            ${classificationChip(group.classification_status)}
          </button>
        </div>
        <div class="card-metrics">
          <span class="figure"><span>${escapeHtml(originLabel[group.origin] ?? group.origin ?? "Origem desconhecida")}</span></span>
          <span class="figure"><span>${escapeHtml(plural(aliases.length, "nome observado", "nomes observados"))}</span></span>
          <span class="figure"><span>Última atividade: ${escapeHtml(formatTime(group.last_seen_at))}</span></span>
        </div>
      </article>`;
    }).join("");
};

// ── Captura ─────────────────────────────────────────────────────────────────

const renderHealth = () => {
  const health = state.data.health;
  const presentation = healthPresentation(health);
  renderStatusBlock("#health-summary");
  const layers = presentation.layers;
  const layersTarget = document.querySelector("#health-layers");
  layersTarget.hidden = !layers;
  if (layers) {
    const nomes = { device: "Aparelho", capture: "Captura", sync: "Sincronização" };
    layersTarget.innerHTML = [
      ...["device", "capture", "sync"].filter((chave) => layers[chave]).map((chave) => `
        <div class="health-layer">
          <span class="status-dot ${escapeHtml(layers[chave].state)}" aria-hidden="true"></span>
          <div><strong>${escapeHtml(nomes[chave])}: ${escapeHtml(layers[chave].label)}</strong><p>${escapeHtml(layers[chave].detail)}</p></div>
        </div>`),
      presentation.action ? `
        <div class="health-layer">
          <span class="status-dot ${presentation.humanAction ? "warning" : "neutral"}" aria-hidden="true"></span>
          <div><strong>${presentation.humanAction ? "Ação necessária" : "Próximo passo"}</strong><p>${escapeHtml(presentation.action)}</p></div>
        </div>` : ""
    ].join("");
  }
  document.querySelector("#health-card").innerHTML = [
    ["Grupos acompanhados", state.data.overview.conversation_count],
    ["Confiança da captura na janela", captureLabel[health.capture_confidence?.level] ?? "não informada"],
    ["Última atualização recebida", formatTime(health.observed_at)],
    ["Última atividade capturada", formatTime(health.last_event_captured_at)],
    ["Envios aguardando", health.outbox_pending > 0 ? plural(health.outbox_pending, "item", "itens") : "Nenhum"]
  ].map(([label, value]) => `<div class="health-row"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  document.querySelector("#technical-health").innerHTML = [
    ["Fonte", health.source],
    ["Versão do adaptador", health.adapter_version],
    ["Versão do interpretador", health.parser_version],
    ["Último envio concluído", formatTime(health.last_upload_succeeded_at)],
    ["Motivo da confiança", coverageReasonLabel(health.capture_confidence?.reason)]
  ].map(([label, value]) => `<div class="health-row"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  document.querySelector("#provenance-notice").textContent = state.data.provenance.warning;
};

// ── Sidebar de estado ───────────────────────────────────────────────────────

const setBadge = (target, value, tone = "", label = null) => {
  const badge = document.querySelector(`[data-badge="${target}"]`);
  if (!badge) return;
  const visivel = value !== null && value !== undefined && value !== 0 && value !== "";
  badge.hidden = !visivel;
  badge.className = `nav-badge ${tone}`.trim();
  badge.textContent = visivel ? String(value) : "";
  if (label) badge.setAttribute("aria-label", label); else badge.removeAttribute("aria-label");
};

const renderSidebar = () => {
  const data = state.data;
  if (!data) return;
  const presentation = healthPresentation(data.health);
  const consolidatedAt = data.freshness?.completed_at ?? data.generated_at;
  document.querySelector("#sidebar-state").innerHTML = `
    <div class="state-line">
      <span class="status-dot ${escapeHtml(presentation.level)}" aria-hidden="true"></span>
      <div><strong>${escapeHtml(presentation.label)}</strong><span>Consolidado ${escapeHtml(describeAge(consolidatedAt))}</span></div>
    </div>`;

  const controlCenter = data.group_control_center;
  const summary = controlCenter?.summary ?? {};
  const naoClassificados = state.mode === "live" && data.group_registry
    ? (data.group_registry.groups ?? []).filter((group) => group.status !== "archived" && group.classification_status !== "confirmed").length
    : summary.unclassified ?? 0;

  setBadge("overview", data.overview?.alert_count ?? 0, "alert", "situações que merecem atenção");
  setBadge("control", controlCenter?.enabled ? summary.attention ?? 0 : 0, "alert", "grupos em atenção");
  setBadge("situations", (data.attention ?? []).length, "warn", "situações no período");
  setBadge("groups", naoClassificados, "warn", "grupos sem classificação confirmada");
  // `evaluateCaptureHealth` tem quatro níveis. "neutral" é aparelho saudável sem
  // notificação recente — não é falha, e um sinal de alerta ali mandaria a
  // operação conferir um aparelho que está bem.
  const tomDaCaptura = { ok: null, neutral: "ok", warning: "warn", critical: "alert" }[presentation.level] ?? "warn";
  setBadge("health", tomDaCaptura === null ? 0 : tomDaCaptura === "ok" ? "·" : "!",
    tomDaCaptura ?? "warn", `captura: ${presentation.label}`);

  const anchor = controlCenter?.anchor;
  document.querySelector("#sidebar-anchor").innerHTML = anchor?.current_run_id
    ? `<strong>Janela analisada</strong>
       ${escapeHtml(formatTime(anchor.current_window_start))} → ${escapeHtml(formatTime(anchor.current_window_end))}<br>
       ${anchor.comparison_run_id
        ? `Comparada com o mesmo horário do dia anterior.`
        : `Sem comparação: ${escapeHtml(trendReasonLabel(anchor.comparison_unavailable_reason))}.`}`
    : "<strong>Janela analisada</strong>Ainda não há consolidação para exibir.";
};

const renderOperationalHealth = () => {
  const banner = document.querySelector("#operational-health-banner");
  const health = state.data.operational_health;
  // Nem o GitHub Actions nem o pg_cron avisam alguém ativamente hoje (D-024);
  // este banner é onde esse alerta aparece de fato, para quem já está com a
  // tela aberta.
  if (!health || health.healthy || health.problems.length === 0) {
    banner.hidden = true;
    banner.innerHTML = "";
    return;
  }
  banner.hidden = false;
  banner.innerHTML = `
    <strong>${plural(health.problems.length, "aviso operacional", "avisos operacionais")}</strong>
    <ul>${health.problems.map((problem) => `<li>${escapeHtml(problem.summary)}</li>`).join("")}</ul>
  `;
};

const renderAll = () => {
  // O cadastro alimenta o painel de detalhe aberto a partir de qualquer lista,
  // então ele é indexado antes de qualquer render, não dentro da tela Grupos.
  state.registryGroups = new Map((state.data?.group_registry?.groups ?? []).map((group) => [group.id, group]));
  renderOverview();
  renderControlCenter();
  renderSituations();
  renderGroups();
  renderHealth();
  renderOperationalHealth();
  renderSidebar();
};

// ── Navegação e shell ───────────────────────────────────────────────────────

const sidebarPersistente = window.matchMedia("(min-width: 1024px)");

// Uma gaveta fechada continua no fluxo de foco se nada a tirar de lá: o Tab
// entraria em cinco destinos invisíveis antes de chegar ao conteúdo. `inert`
// resolve os dois lados, foco e leitor de tela, sem duplicar marcação.
const sincronizarInertDaSidebar = () => {
  const sidebar = document.querySelector("#sidebar");
  const gaveta = !sidebarPersistente.matches;
  sidebar.inert = gaveta && !document.body.classList.contains("sidebar-open");
};

const setSidebarOpen = (open) => {
  document.body.classList.toggle("sidebar-open", open);
  document.querySelector("#sidebar-scrim").hidden = !open;
  document.querySelector("#menu-button").setAttribute("aria-expanded", String(open));
  sincronizarInertDaSidebar();
  if (open) document.querySelector("#sidebar-nav .nav-item")?.focus();
};

sidebarPersistente.addEventListener("change", sincronizarInertDaSidebar);

const setSidebarCollapsed = (collapsed) => {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  const button = document.querySelector("#sidebar-collapse");
  button.setAttribute("aria-expanded", String(!collapsed));
  button.setAttribute("aria-label", collapsed ? "Expandir menu" : "Recolher menu");
  button.title = collapsed ? "Expandir menu" : "Recolher menu";
  try {
    localStorage.setItem("radar.sidebar.collapsed", collapsed ? "1" : "0");
  } catch {
    // Preferência de layout é conveniência; sem armazenamento a tela continua igual.
  }
};

const showScreen = (requestedName) => {
  const name = SCREENS.includes(requestedName) ? requestedName : "overview";
  state.screen = name;
  document.querySelectorAll(".screen").forEach((screen) => {
    const active = screen.dataset.screen === name;
    screen.hidden = !active;
    screen.classList.toggle("active", active);
  });
  // A tabbar é a navegação principal declarada para leitores de tela; a sidebar
  // é um controle auxiliar e não repete aria-current, para não anunciar duas
  // páginas atuais.
  document.querySelectorAll(".tab[data-target]").forEach((tab) => {
    const active = tab.dataset.target === name;
    tab.classList.toggle("active", active);
    if (active) tab.setAttribute("aria-current", "page"); else tab.removeAttribute("aria-current");
  });
  document.querySelectorAll(".nav-item[data-target]").forEach((item) => {
    item.classList.toggle("active", item.dataset.target === name);
  });
  document.querySelector("#topbar-title").textContent = SCREEN_TITLES[name];
  setSidebarOpen(false);
  const url = new URL(location.href);
  url.hash = name;
  history.replaceState(null, "", url);
  document.querySelector("#main").focus({ preventScroll: true });
};

const setLoading = (message = "Preparando o Radar…") => {
  const loading = document.querySelector("#loading-state");
  loading.textContent = message;
  loading.classList.remove("error");
  loading.hidden = false;
};

const showData = () => {
  document.querySelector("#auth-panel").hidden = true;
  document.querySelector("#radar-content").hidden = false;
  document.querySelector("#sidebar-nav").hidden = false;
  document.querySelector(".tabbar").hidden = false;
  document.querySelector("#signout-button").hidden = state.mode !== "live";
  document.querySelector("#loading-state").hidden = true;
};

const showAuth = (message = "") => {
  document.querySelector("#source-label").textContent = "Rede conectada · acesso necessário";
  document.querySelector("#auth-message").textContent = message;
  document.querySelector("#auth-panel").hidden = false;
  document.querySelector("#radar-content").hidden = true;
  document.querySelector("#sidebar-nav").hidden = true;
  document.querySelector(".tabbar").hidden = true;
  document.querySelector("#loading-state").hidden = true;
};

const readSynthetic = async (name = state.scenario) => {
  const path = name ? `/data/${encodeURIComponent(name)}.json` : "/data/radar.json";
  const response = await fetch(`${path}?ts=${Date.now()}`);
  if (!response.ok) throw new Error(`Falha ao carregar o Radar: ${response.status}`);
  return response.json();
};

const readRadar = () => state.mode === "live"
  ? state.provider.readModel(state.config.live.network_id)
  : readSynthetic();

const applyRadar = (data) => {
  state.data = data;
  if (data.scenario?.synthetic) {
    state.scenario = data.scenario.name;
    document.querySelector("#scenario-select").value = state.scenario;
  }
  renderAll();
  showData();
};

const updateRefreshStatus = ({ state: refreshState, reason, lastReadAt, consolidatedAt, error }) => {
  const button = document.querySelector("#refresh-button");
  const status = document.querySelector("#refresh-status");
  button.disabled = refreshState === "loading";
  if (refreshState === "loading") {
    status.textContent = reason === "automatic" ? "Verificando dados…" : "Atualizando…";
    return;
  }
  if (refreshState === "error") {
    status.textContent = lastReadAt ? `Falha ao atualizar · leitura das ${formatClock(lastReadAt)}` : "Não foi possível atualizar";
    if (!state.data) showError(error);
    return;
  }
  const readLabel = `Consultado às ${formatClock(lastReadAt)}`;
  const consolidationLabel = consolidatedAt ? ` · consolidado ${describeAge(consolidatedAt)}` : "";
  const pending = state.data?.freshness?.events_after_window ?? 0;
  const pendingLabel = pending > 0
    ? ` · ${plural(pending, "evento ainda fora da janela", "eventos ainda fora da janela")}`
    : "";
  status.textContent = `${readLabel}${consolidationLabel}${state.lastConsolidation ?? ""}${pendingLabel}`;
};

state.refreshController = createRadarRefreshController({
  read: readRadar,
  apply: applyRadar,
  onStatus: updateRefreshStatus,
  isVisible: () => document.visibilityState === "visible" && state.mode === "live"
});

const refreshRadar = (reason) => state.refreshController.refresh(reason);

const liveRedirectUrl = () => {
  const url = new URL(location.href);
  url.hash = "";
  url.searchParams.set("mode", "live");
  return url.toString();
};

const loadManifest = async () => {
  const response = await fetch("/data/scenarios.json");
  if (!response.ok) throw new Error(`Falha ao carregar cenários: ${response.status}`);
  state.manifest = await response.json();
  const select = document.querySelector("#scenario-select");
  select.replaceChildren(...state.manifest.scenarios.map((scenario) => {
    const option = document.createElement("option");
    option.value = scenario.name;
    option.textContent = scenario.label;
    return option;
  }));
  const requested = new URLSearchParams(location.search).get("scenario");
  return state.manifest.scenarios.some((scenario) => scenario.name === requested) ? requested : state.manifest.default;
};

const setMode = async (mode) => {
  const liveEnabled = state.config.live?.enabled === true;
  state.mode = mode === "live" && liveEnabled ? "live" : "lab";
  document.querySelector("#mode-select").value = state.mode;
  document.querySelector("#scenario-control").hidden = state.mode === "live";
  const url = new URL(location.href);
  if (state.mode === "live") url.searchParams.set("mode", "live"); else url.searchParams.delete("mode");
  history.replaceState(null, "", url);
  setLoading(state.mode === "live" ? "Conectando à rede…" : "Carregando demonstração…");

  if (state.mode === "lab") {
    state.refreshController.stop();
    return refreshRadar("initial");
  }
  if (!state.provider) {
    state.provider = createSupabaseProvider({
      url: state.config.live.url,
      publishableKey: state.config.live.publishable_key
    });
  }
  const redirectSession = state.provider.captureRedirectSession(location.href);
  if (redirectSession) {
    const cleanUrl = new URL(location.href);
    cleanUrl.hash = "";
    cleanUrl.searchParams.set("mode", "live");
    history.replaceState(null, "", cleanUrl);
  }
  const session = redirectSession ?? await state.provider.restoreSession();
  if (!session) {
    state.refreshController.stop();
    return showAuth();
  }
  const data = await refreshRadar("initial");
  state.refreshController.start();
  return data;
};

const showError = (error) => {
  const loading = document.querySelector("#loading-state");
  loading.textContent = error instanceof Error ? error.message : "Não foi possível carregar o Radar.";
  loading.classList.add("error");
  loading.hidden = false;
};

document.querySelectorAll(".tab[data-target], .nav-item[data-target]")
  .forEach((control) => control.addEventListener("click", () => showScreen(control.dataset.target)));
document.querySelector("#menu-button").addEventListener("click", () => {
  setSidebarOpen(!document.body.classList.contains("sidebar-open"));
});
document.querySelector("#sidebar-scrim").addEventListener("click", () => setSidebarOpen(false));
document.querySelector("#sidebar-collapse").addEventListener("click", () => {
  if (window.matchMedia("(min-width: 1024px)").matches) {
    setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
    return;
  }
  setSidebarOpen(false);
  document.querySelector("#menu-button").focus();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !document.body.classList.contains("sidebar-open")) return;
  setSidebarOpen(false);
  document.querySelector("#menu-button").focus();
});

document.querySelector("#search-input").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderGroups();
});
document.querySelector("#control-search").addEventListener("input", (event) => {
  state.controlQuery = event.target.value;
  renderControlCenter();
});
document.querySelectorAll("[data-severity]").forEach((button) => button.addEventListener("click", () => {
  state.severity = button.dataset.severity;
  document.querySelectorAll("[data-severity]").forEach((item) => item.classList.toggle("active", item === button));
  renderSituations();
}));
const applyPreset = (preset) => {
  state.preset = PRESETS[preset] ? preset : "all";
  document.querySelectorAll("#control-presets [data-preset]").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.preset === state.preset);
  });
  renderControlCenter();
};
document.querySelector("#control-presets").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-preset]");
  if (chip) applyPreset(chip.dataset.preset);
});
document.querySelector("#control-center-summary").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-preset]");
  if (chip) applyPreset(chip.dataset.preset);
});
document.querySelector("#attention-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-situation]");
  if (!button) return;
  state.severity = "all";
  document.querySelectorAll("[data-severity]").forEach((item) => item.classList.toggle("active", item.dataset.severity === "all"));
  renderSituations();
  showScreen("situations");
  const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll("#situation-list .situation-card")[Number(button.dataset.openSituation)]
    ?.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
});

const salvarClassificacao = async (form) => {
  const message = form.querySelector(".registry-message");
  const values = Object.fromEntries(new FormData(form));
  for (const field of ["context_type", "context_label", "municipality", "territory", "primary_steward_label"]) {
    if (values[field] === "") values[field] = null;
  }
  message.textContent = "Salvando…";
  try {
    await state.provider.classifyGroup(form.dataset.groupId, values);
    message.textContent = "Classificação salva.";
    await refreshRadar("manual");
  } catch {
    message.textContent = "Não foi possível salvar. Confirme sua permissão e os campos.";
  }
};

document.querySelector("#group-drawer-content").addEventListener("submit", (event) => {
  const form = event.target.closest("[data-group-id]");
  if (!form) return;
  event.preventDefault();
  salvarClassificacao(form);
});
document.querySelector("#group-drawer-content").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-review-alias]");
  if (!button) return;
  button.disabled = true;
  try {
    await state.provider.reviewGroupAlias(button.dataset.reviewAlias, button.dataset.resolution);
    await refreshRadar("manual");
  } catch {
    button.disabled = false;
  }
});

// O GET do read model deixou de consolidar na P1.1. Sem isto, a operação não tem
// como forçar uma janela entre os slots agendados. A consolidação só é tentada
// no modo live e por quem tem papel para isso; qualquer recusa vira texto, e a
// releitura acontece de todo jeito.
const consolidateBeforeRead = async () => {
  if (state.mode !== "live" || !state.provider?.refreshLatestWindow) return null;
  if (state.data?.group_registry?.can_manage !== true) return null;
  try {
    return await state.provider.refreshLatestWindow(state.config.live.network_id);
  } catch (error) {
    return { ok: false, status: "failed", message: error.message };
  }
};

const consolidationNotice = (result) => {
  if (!result) return "";
  if (result.ok && result.processed === true) return " · consolidação executada";
  if (result.ok && result.status === "up_to_date") return " · já estava atualizado";
  if (result.ok && result.status === "no_events") return " · sem eventos novos";
  if (result.status === "rate_limited") {
    const espera = Number(result.retry_after_seconds);
    return Number.isFinite(espera)
      ? ` · nova consolidação liberada em ${Math.ceil(espera / 60)} min`
      : " · consolidação em intervalo mínimo";
  }
  if (result.status === "not_authorized") return "";
  return " · não foi possível consolidar agora";
};

document.querySelector("#refresh-button").addEventListener("click", async () => {
  const button = document.querySelector("#refresh-button");
  const status = document.querySelector("#refresh-status");
  button.disabled = true;
  status.textContent = "Consolidando…";
  const result = await consolidateBeforeRead();
  state.lastConsolidation = consolidationNotice(result);
  refreshRadar("manual").catch(() => {}).finally(() => { button.disabled = false; });
});
for (const [selector, key] of [["#condition-filter", "groupCondition"], ["#trend-filter", "groupTrend"], ["#group-status-filter", "groupStatus"], ["#origin-filter", "groupOrigin"], ["#context-filter", "groupContext"], ["#group-sort", "groupSort"]]) {
  document.querySelector(selector).addEventListener("change", (event) => {
    state[key] = event.target.value;
    renderControlCenter();
  });
}
for (const selector of ["#control-group-list", "#registry-list"]) {
  document.querySelector(selector).addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-group]");
    if (button) openGroupDrawer(button.dataset.openGroup, button);
  });
}
const fecharDrawer = () => document.querySelector("#group-drawer").close();
document.querySelector("#close-group-drawer").addEventListener("click", fecharDrawer);
document.querySelector("#group-drawer").addEventListener("close", () => {
  state.drawerTrigger?.focus?.();
  state.drawerTrigger = null;
});
document.querySelector("#scenario-select").addEventListener("change", (event) => {
  const url = new URL(location.href);
  url.searchParams.set("scenario", event.target.value);
  history.replaceState(null, "", url);
  setLoading("Trocando situação…");
  state.scenario = event.target.value;
  refreshRadar("manual").catch(showError);
});
document.querySelector("#mode-select").addEventListener("change", (event) => setMode(event.target.value).catch(showError));
document.querySelector("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = resolveLoginIdentifier(document.querySelector("#auth-email").value);
  const password = document.querySelector("#auth-password").value;
  document.querySelector("#auth-message").textContent = "Entrando…";
  try {
    await state.provider.signIn(email, password);
    setLoading("Carregando a rede…");
    await refreshRadar("initial");
    state.refreshController.start();
  } catch {
    showAuth("Não foi possível entrar. Confira usuário ou e-mail, senha e autorização da rede.");
  }
});
document.querySelector("#signup-button").addEventListener("click", async () => {
  const identifier = document.querySelector("#auth-email").value;
  const email = resolveLoginIdentifier(identifier);
  const password = document.querySelector("#auth-password").value;
  if (!isEmailIdentifier(identifier) || password.length < 8) return showAuth("Para criar um acesso, informe um e-mail válido e uma senha de pelo menos 8 caracteres.");
  document.querySelector("#auth-message").textContent = "Criando acesso…";
  try {
    const result = await state.provider.signUp(email, password, { redirectTo: liveRedirectUrl() });
    if (result.access_token) {
      setLoading("Carregando a rede…");
      try {
        await refreshRadar("initial");
        state.refreshController.start();
      } catch {
        showAuth("Acesso criado, mas este usuário ainda precisa ser incluído na rede.");
      }
    } else {
      showAuth("Acesso criado. Confirme o e-mail e aguarde a inclusão na rede antes de entrar.");
    }
  } catch {
    showAuth("Não foi possível criar o acesso. Verifique os dados ou tente entrar.");
  }
});
document.querySelector("#signout-button").addEventListener("click", async () => {
  state.refreshController.stop();
  await state.provider.signOut();
  showAuth("Sessão encerrada.");
});

document.addEventListener("visibilitychange", () => {
  if (state.mode === "live" && document.visibilityState === "visible") {
    state.refreshController.refreshIfStale().catch(() => {});
  }
});

const restoreSidebarPreference = () => {
  try {
    setSidebarCollapsed(localStorage.getItem("radar.sidebar.collapsed") === "1");
  } catch {
    setSidebarCollapsed(false);
  }
};

restoreSidebarPreference();
sincronizarInertDaSidebar();

Promise.all([
  fetch("/data/runtime-config.json").then((response) => response.json()),
  loadManifest()
]).then(async ([config, defaultScenario]) => {
  state.config = config;
  state.scenario = defaultScenario;
  const liveOption = document.querySelector('#mode-select option[value="live"]');
  liveOption.disabled = state.config.live?.enabled !== true;
  const requestedMode = new URLSearchParams(location.search).get("mode");
  await setMode(requestedMode === "live" ? "live" : "lab");
  if (!document.querySelector("#radar-content").hidden) showScreen(location.hash.slice(1) || "overview");
}).catch(showError);
