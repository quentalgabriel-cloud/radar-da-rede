const categoryLabels = {
  agenda_mobilizacao: "Agenda e mobilização",
  material_logistica: "Material e logística",
  duvida_orientacao: "Dúvidas e orientação",
  demanda_territorial: "Demanda territorial",
  problema_operacional: "Problema operacional",
  alegacao_verificar: "Alegação a verificar",
  outros: "Outros"
};

const excerpt = (text, maximum = 120) =>
  typeof text !== "string" ? "" : text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;

const humanize = (value) => String(value ?? "")
  .replace(/[-_]+/g, " ")
  .replace(/\b\p{L}/gu, (character) => character.toLocaleUpperCase("pt-BR"));

const sourceSummary = (sourceEventIds, eventById) => {
  const sourceEvents = sourceEventIds.map((id) => eventById.get(id)).filter(Boolean);
  const timestamps = sourceEvents.map((event) => event.occurred_at).filter(Boolean).sort();
  return {
    mention_count: sourceEvents.length,
    conversation_count: new Set(sourceEvents.map((event) => event.conversation_id)).size,
    territories: [...new Set(sourceEvents.map((event) => event.metadata?.territory).filter(Boolean))].map(humanize),
    first_seen_at: timestamps[0] ?? null,
    last_seen_at: timestamps.at(-1) ?? null
  };
};

export function buildPersistedRadarViewModel({ network, run, events, facts, signals, alerts, health }) {
  const eventById = new Map(events.map((event) => [event.event_id, event]));
  const conversations = new Map();
  for (const event of events) {
    const current = conversations.get(event.conversation_id) ?? {
      id: event.conversation_id,
      label: event.conversation_label ?? event.conversation_id,
      territory: event.metadata?.territory ?? null,
      event_count: 0,
      last_seen_at: event.occurred_at
    };
    current.event_count += 1;
    if (Date.parse(event.occurred_at) > Date.parse(current.last_seen_at)) current.last_seen_at = event.occurred_at;
    conversations.set(event.conversation_id, current);
  }

  const movementTopicsByEvent = new Map();
  for (const fact of facts) {
    const label = categoryLabels[fact.kind] ?? humanize(fact.kind);
    for (const eventId of fact.source_event_ids) {
      const topics = movementTopicsByEvent.get(eventId) ?? new Set();
      topics.add(label);
      movementTopicsByEvent.set(eventId, topics);
    }
  }

  const openAlerts = alerts.filter((alert) => alert.status === "open");
  const openSituationsByConversation = new Map();
  for (const alert of openAlerts) {
    for (const eventId of alert.source_event_ids) {
      const conversationId = eventById.get(eventId)?.conversation_id;
      if (!conversationId) continue;
      const situations = openSituationsByConversation.get(conversationId) ?? new Set();
      situations.add(alert.id);
      openSituationsByConversation.set(conversationId, situations);
    }
  }

  const territoryMap = new Map();
  for (const event of events) {
    const rawTerritory = event.metadata?.territory;
    if (!rawTerritory) continue;
    const territory = territoryMap.get(rawTerritory) ?? {
      id: rawTerritory,
      label: humanize(rawTerritory),
      event_count: 0,
      conversations: new Set(),
      topics: new Map(),
      situations: new Set(),
      last_seen_at: event.occurred_at
    };
    territory.event_count += 1;
    territory.conversations.add(event.conversation_id);
    if (Date.parse(event.occurred_at) > Date.parse(territory.last_seen_at)) territory.last_seen_at = event.occurred_at;
    for (const topic of movementTopicsByEvent.get(event.event_id) ?? []) territory.topics.set(topic, (territory.topics.get(topic) ?? 0) + 1);
    for (const situation of openSituationsByConversation.get(event.conversation_id) ?? []) territory.situations.add(situation);
    territoryMap.set(rawTerritory, territory);
  }

  const movements = facts.map((fact) => {
    const source = sourceSummary(fact.source_event_ids, eventById);
    const mentionCount = fact.payload?.mention_count ?? source.mention_count;
    const conversationCount = fact.payload?.conversation_count ?? source.conversation_count;
    const label = categoryLabels[fact.kind] ?? humanize(fact.kind);
    return {
      category: fact.kind,
      label,
      summary: `${label} apareceu em ${conversationCount} ${conversationCount === 1 ? "grupo" : "grupos"} no período analisado.`,
      mention_count: mentionCount,
      conversation_count: conversationCount,
      territory_count: source.territories.length,
      territories: source.territories,
      first_seen_at: fact.payload?.first_seen_at ?? source.first_seen_at,
      last_seen_at: fact.payload?.last_seen_at ?? source.last_seen_at,
      severity: mentionCount >= 5 ? "high" : mentionCount >= 3 ? "medium" : "low",
      source_event_ids: fact.source_event_ids
    };
  });

  const attention = openAlerts.map((alert) => {
    const source = sourceSummary(alert.source_event_ids, eventById);
    return {
      alert_version: alert.rules_version,
      kind: alert.kind,
      category: alert.payload?.category ?? alert.kind,
      severity: alert.severity,
      status: alert.status,
      source_event_ids: alert.source_event_ids,
      reason: alert.summary,
      title: alert.title,
      ...source,
      explanation: [
        `${source.mention_count} ${source.mention_count === 1 ? "atividade relacionada" : "atividades relacionadas"} no período.`,
        `${source.conversation_count} ${source.conversation_count === 1 ? "grupo envolvido" : "grupos envolvidos"}.`,
        source.territories.length > 0
          ? `${source.territories.length} ${source.territories.length === 1 ? "território relacionado" : "territórios relacionados"}.`
          : "Território ainda não informado."
      ],
      evidence: alert.source_event_ids.slice(0, 4).map((id) => {
        const event = eventById.get(id);
        return {
          event_id: id,
          conversation: event?.conversation_label ?? event?.conversation_id ?? "Grupo desconhecido",
          territory: humanize(event?.metadata?.territory),
          occurred_at: event?.occurred_at ?? null,
          text: excerpt(event?.text)
        };
      })
    };
  });

  return {
    schema_version: "0.1.0",
    generated_at: run.completed_at,
    scenario: {
      name: network.name,
      description: `Janela processada de ${run.starts_at} a ${run.ends_at}`,
      synthetic: false
    },
    overview: {
      event_count: run.input_event_count,
      conversation_count: conversations.size,
      territory_count: territoryMap.size,
      fact_count: facts.length,
      signal_count: signals.length,
      alert_count: openAlerts.length,
      coverage: {
        status: "unvalidated",
        label: "Fonte conectada; cobertura não validada",
        percentage: null
      }
    },
    movements,
    attention,
    territories: [...territoryMap.values()].map((territory) => ({
      id: territory.id,
      label: territory.label,
      event_count: territory.event_count,
      conversation_count: territory.conversations.size,
      open_situation_count: territory.situations.size,
      last_seen_at: territory.last_seen_at,
      topics: [...territory.topics.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, count]) => ({ label, count }))
    })).sort((a, b) => b.open_situation_count - a.open_situation_count || b.event_count - a.event_count),
    conversations: [...conversations.values()].map((conversation) => {
      const eventIds = events.filter((event) => event.conversation_id === conversation.id).map((event) => event.event_id);
      const topicCounts = new Map();
      for (const eventId of eventIds) {
        for (const topic of movementTopicsByEvent.get(eventId) ?? []) topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
      }
      return {
        ...conversation,
        territory: humanize(conversation.territory),
        activity: conversation.event_count >= 5 ? "high" : conversation.event_count >= 2 ? "medium" : "low",
        open_situation_count: openSituationsByConversation.get(conversation.id)?.size ?? 0,
        topics: [...topicCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label]) => label)
      };
    }).sort((a, b) => b.open_situation_count - a.open_situation_count || b.event_count - a.event_count),
    recent_events: [...events]
      .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
      .map((event) => ({
        id: event.event_id,
        conversation: event.conversation_label ?? event.conversation_id,
        territory: event.metadata?.territory ?? null,
        occurred_at: event.occurred_at,
        text: excerpt(event.text, 180)
      })),
    health: health ? {
      status: health.status,
      source: health.source,
      observed_at: health.observed_at,
      outbox_pending: health.outbox_pending,
      last_event_captured_at: health.last_event_captured_at,
      last_upload_succeeded_at: health.last_upload_succeeded_at,
      adapter_version: health.adapter_version,
      parser_version: health.parser_version
    } : {
      status: "unknown",
      source: "unknown",
      observed_at: null,
      outbox_pending: 0,
      last_event_captured_at: null,
      last_upload_succeeded_at: null,
      adapter_version: "unknown",
      parser_version: "unknown"
    },
    provenance: {
      pipeline_version: run.pipeline_version,
      taxonomy_version: run.taxonomy_version,
      processing_run_id: run.id,
      warning: "Resultados processados com proveniência preservada; a cobertura da fonte ainda depende de validação física."
    }
  };
}
