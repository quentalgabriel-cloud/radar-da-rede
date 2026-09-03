import { createSupabaseProvider } from "./supabase-provider.js";
import { isEmailIdentifier, resolveLoginIdentifier } from "./auth-identity.js";
import { createRadarRefreshController } from "./refresh-controller.js";

const state = {
  config: null,
  data: null,
  manifest: null,
  mode: "lab",
  provider: null,
  refreshController: null,
  query: "",
  scenario: null,
  severity: "all"
};

const formatTime = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Recife" }).format(new Date(value))
  : "Ainda não informado";

const formatClock = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Recife" }).format(new Date(value))
  : null;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;"
})[character]);

const safeSeverity = (value) => new Set(["high", "medium", "low"]).has(value) ? value : "low";
const severityLabel = { high: "Atenção", medium: "Em acompanhamento", low: "Informativo" };
const activityLabel = { high: "Alta", medium: "Moderada", low: "Baixa" };

const plural = (value, singular, pluralForm) => `${value} ${value === 1 ? singular : pluralForm}`;

const scenarioLabel = (name) => state.manifest?.scenarios
  .find((scenario) => scenario.name === name)?.label ?? "Cenário de demonstração";

const healthPresentation = (health) => {
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
    <span class="status-dot ${status.level}" aria-hidden="true"></span>
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
        <span class="situation-status">${item.status === "resolved" ? "Resolvido" : "Em aberto"}</span>
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
  document.querySelector("#alert-count").textContent = overview.alert_count;
  renderStatusBlock("#network-status");

  document.querySelector("#metric-grid").innerHTML = [
    [overview.conversation_count, "grupos acompanhados"],
    [overview.alert_count, "situações abertas"],
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
        <header><strong>${escapeHtml(territory.label)}</strong><span>${escapeHtml(plural(territory.open_situation_count, "situação ativa", "situações ativas"))}</span></header>
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

const renderGroups = () => {
  const query = state.query.toLocaleLowerCase("pt-BR");
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
              <div><dt>Situações abertas</dt><dd>${escapeHtml(conversation.open_situation_count ?? 0)}</dd></div>
            </dl>
            <div class="tag-list">${(conversation.topics ?? []).map((topic) => `<span>${escapeHtml(topic)}</span>`).join("") || "<span>Sem assunto classificado</span>"}</div>
            <h3>Trecho da conversa</h3>
            <div class="timeline">${events.slice().reverse().map((event) => `
              <div class="timeline-item"><time>${escapeHtml(formatTime(event.occurred_at))}</time><p>“${escapeHtml(event.text)}”</p></div>
            `).join("") || '<p class="empty">Ainda não há mensagens disponíveis.</p>'}</div>
            ${conversation.open_situation_count > 0 ? `<div class="radar-note"><strong>Radar identificou</strong><span>${escapeHtml(plural(conversation.open_situation_count, "situação em acompanhamento", "situações em acompanhamento"))} neste grupo.</span></div>` : ""}
          </div>
        </details>
      `;
    }).join("");
  renderGroupRegistry();
};

const registryLabel = (value) => ({
  unclassified: "Não classificado", partially_classified: "Classificação parcial", confirmed: "Confirmado",
  automatic: "Automático", ambiguous: "Revisar", rejected: "Rejeitado"
})[value] ?? value ?? "Não informado";

const renderGroupRegistry = () => {
  const section = document.querySelector("#group-registry");
  const registry = state.data?.group_registry;
  section.hidden = state.mode !== "live" || !registry;
  if (section.hidden) return;
  const summary = registry.summary ?? {};
  document.querySelector("#registry-summary").textContent =
    `${summary.groups ?? 0} grupos · ${summary.unclassified ?? 0} não classificados · ${summary.ambiguous ?? 0} aliases para revisar.`;
  const aliasesByGroup = new Map();
  for (const alias of registry.aliases ?? []) aliasesByGroup.set(alias.group_id, [...(aliasesByGroup.get(alias.group_id) ?? []), alias]);
  const changesByGroup = new Map();
  for (const change of registry.changes ?? []) changesByGroup.set(change.group_id, [...(changesByGroup.get(change.group_id) ?? []), change]);
  const query = state.query.toLocaleLowerCase("pt-BR");
  const groups = (registry.groups ?? []).filter((group) => [group.current_label, group.territory, group.municipality, group.context_label]
    .some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(query)));
  document.querySelector("#registry-list").innerHTML = groups.map((group) => {
    const aliases = aliasesByGroup.get(group.id) ?? [];
    const changes = changesByGroup.get(group.id) ?? [];
    const editable = registry.can_manage ? `
      <form class="registry-form" data-group-id="${escapeHtml(group.id)}">
        <label>Origem<select name="origin"><option value="unknown">Desconhecida</option><option value="legacy">Legado</option><option value="current_operation">Operação atual</option></select></label>
        <label>Contexto<select name="context_type"><option value="">Não informado</option>${["territory","leadership","project","theme","community","event","organic","other"].map((value) => `<option value="${value}">${registryLabel(value)}</option>`).join("")}</select></label>
        <label>Nome do contexto<input name="context_label" value="${escapeHtml(group.context_label ?? "")}" maxlength="255"></label>
        <label>Município<input name="municipality" value="${escapeHtml(group.municipality ?? "")}" maxlength="160"></label>
        <label>Território<input name="territory" value="${escapeHtml(group.territory ?? "")}" maxlength="160"></label>
        <label>Referência operacional<input name="primary_steward_label" value="${escapeHtml(group.primary_steward_label ?? "")}" maxlength="160"></label>
        <label>Classificação<select name="classification_status"><option value="unclassified">Não classificado</option><option value="partially_classified">Parcial</option><option value="confirmed">Confirmado</option></select></label>
        <button class="primary-button" type="submit">Salvar classificação</button><span class="registry-message" role="status"></span>
      </form>` : '<p class="notice">Você pode consultar esta classificação. Alterações são restritas à gestão da rede.</p>';
    return `<details class="group-card registry-card" data-registry-group="${escapeHtml(group.id)}">
      <summary><div><strong>${escapeHtml(group.current_label)}</strong><span>${escapeHtml(registryLabel(group.classification_status))}</span></div><span>${escapeHtml(formatTime(group.last_seen_at))}</span></summary>
      <div class="group-body">${editable}
        <details><summary>Aliases observados (${aliases.length})</summary><div>${aliases.map((alias) => `<div class="alias-row"><span>${escapeHtml(alias.observed_label)} · ${escapeHtml(registryLabel(alias.resolution_status))}</span>${registry.can_manage && alias.resolution_status === "ambiguous" ? `<button type="button" data-review-alias="${escapeHtml(alias.id)}" data-resolution="confirmed">Confirmar</button><button type="button" data-review-alias="${escapeHtml(alias.id)}" data-resolution="rejected">Rejeitar</button>` : ""}</div>`).join("") || "Nenhum alias."}</div></details>
        <details><summary>Ver histórico (${changes.length})</summary><div>${changes.map((change) => `<p>${escapeHtml(formatTime(change.changed_at))}: ${escapeHtml(change.field_name)}</p>`).join("") || "Nenhuma alteração manual."}</div></details>
      </div></details>`;
  }).join("") || '<p class="empty">Nenhum grupo do registro encontrado.</p>';
  for (const group of groups) {
    const form = document.querySelector(`[data-group-id="${CSS.escape(group.id)}"]`);
    if (!form) continue;
    for (const name of ["origin", "context_type", "classification_status"]) form.elements[name].value = group[name] ?? "";
  }
};

const renderHealth = () => {
  const health = state.data.health;
  renderStatusBlock("#health-summary");
  document.querySelector("#health-card").innerHTML = [
    ["Grupos acompanhados", state.data.overview.conversation_count],
    ["Última atualização recebida", formatTime(health.observed_at)],
    ["Última atividade capturada", formatTime(health.last_event_captured_at)],
    ["Envios aguardando", health.outbox_pending > 0 ? plural(health.outbox_pending, "item", "itens") : "Nenhum"]
  ].map(([label, value]) => `<div class="health-row"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  document.querySelector("#technical-health").innerHTML = [
    ["Fonte", health.source],
    ["Versão do adaptador", health.adapter_version],
    ["Versão do interpretador", health.parser_version],
    ["Último envio concluído", formatTime(health.last_upload_succeeded_at)]
  ].map(([label, value]) => `<div class="health-row"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  document.querySelector("#provenance-notice").textContent = state.data.provenance.warning;
};

const renderAll = () => {
  renderOverview();
  renderSituations();
  renderGroups();
  renderHealth();
};

const showScreen = (requestedName) => {
  const name = ["overview", "situations", "groups", "health"].includes(requestedName) ? requestedName : "overview";
  document.querySelectorAll(".screen").forEach((screen) => {
    const active = screen.dataset.screen === name;
    screen.hidden = !active;
    screen.classList.toggle("active", active);
  });
  document.querySelectorAll(".tab[data-target]").forEach((tab) => {
    const active = tab.dataset.target === name;
    tab.classList.toggle("active", active);
    if (active) tab.setAttribute("aria-current", "page"); else tab.removeAttribute("aria-current");
  });
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
  document.querySelector(".tabbar").hidden = false;
  document.querySelector("#signout-button").hidden = state.mode !== "live";
  document.querySelector("#loading-state").hidden = true;
};

const showAuth = (message = "") => {
  document.querySelector("#source-label").textContent = "Rede conectada · acesso necessário";
  document.querySelector("#auth-message").textContent = message;
  document.querySelector("#auth-panel").hidden = false;
  document.querySelector("#radar-content").hidden = true;
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
  const consolidationLabel = consolidatedAt ? ` · consolidado até ${formatClock(consolidatedAt)}` : "";
  status.textContent = `${readLabel}${consolidationLabel}`;
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

document.querySelectorAll(".tab[data-target]").forEach((tab) => tab.addEventListener("click", () => showScreen(tab.dataset.target)));
document.querySelector("#search-input").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderGroups();
});
document.querySelectorAll(".filter-chip").forEach((button) => button.addEventListener("click", () => {
  state.severity = button.dataset.severity;
  document.querySelectorAll(".filter-chip").forEach((item) => item.classList.toggle("active", item === button));
  renderSituations();
}));
document.querySelector("#attention-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-situation]");
  if (!button) return;
  state.severity = "all";
  document.querySelectorAll(".filter-chip").forEach((item) => item.classList.toggle("active", item.dataset.severity === "all"));
  renderSituations();
  showScreen("situations");
  document.querySelectorAll("#situation-list .situation-card")[Number(button.dataset.openSituation)]?.scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#registry-list").addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-group-id]");
  if (!form) return;
  event.preventDefault();
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
});
document.querySelector("#registry-list").addEventListener("click", async (event) => {
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
document.querySelector("#refresh-button").addEventListener("click", () => {
  refreshRadar("manual").catch(() => {});
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
