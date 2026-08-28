import { analyzeEvents } from "@radar-rede/intelligence";

const labelForCategory = {
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
  const events = sourceEventIds.map((id) => eventById.get(id)).filter(Boolean);
  const timestamps = events.map((event) => event.occurred_at).filter(Boolean).sort();
  return {
    mention_count: events.length,
    conversation_count: new Set(events.map((event) => event.conversation_id)).size,
    territories: [...new Set(events.map((event) => event.metadata?.territory).filter(Boolean))].map(humanize),
    first_seen_at: timestamps[0] ?? null,
    last_seen_at: timestamps.at(-1) ?? null
  };
};

export const buildRadarViewModel = (scenario) => {
  const analysis = analyzeEvents(scenario.events);
  const eventById = new Map(scenario.events.map((event) => [event.event_id, event]));
  const conversations = new Map();
  for (const event of scenario.events) {
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
  for (const fact of analysis.facts) {
    const label = labelForCategory[fact.category] ?? humanize(fact.category);
    for (const eventId of fact.source_event_ids) {
      const topics = movementTopicsByEvent.get(eventId) ?? new Set();
      topics.add(label);
      movementTopicsByEvent.set(eventId, topics);
    }
  }

  const openSituationsByConversation = new Map();
  for (const alert of analysis.alerts) {
    for (const eventId of alert.source_event_ids) {
      const conversationId = eventById.get(eventId)?.conversation_id;
      if (!conversationId) continue;
      const situations = openSituationsByConversation.get(conversationId) ?? new Set();
      situations.add(`${alert.kind}:${alert.category}`);
      openSituationsByConversation.set(conversationId, situations);
    }
  }

  const territoryMap = new Map();
  for (const event of scenario.events) {
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
    for (const topic of movementTopicsByEvent.get(event.event_id) ?? []) {
      territory.topics.set(topic, (territory.topics.get(topic) ?? 0) + 1);
    }
    for (const situation of openSituationsByConversation.get(event.conversation_id) ?? []) territory.situations.add(situation);
    territoryMap.set(rawTerritory, territory);
  }

  const movements = analysis.facts.map((fact) => {
    const summary = sourceSummary(fact.source_event_ids, eventById);
    const label = labelForCategory[fact.category] ?? humanize(fact.category);
    return {
      category: fact.category,
      label,
      summary: `${label} apareceu em ${fact.conversation_count} ${fact.conversation_count === 1 ? "grupo" : "grupos"} no período analisado.`,
      mention_count: fact.mention_count,
      conversation_count: fact.conversation_count,
      territory_count: summary.territories.length,
      territories: summary.territories,
      first_seen_at: fact.first_seen_at,
      last_seen_at: fact.last_seen_at,
      severity: fact.mention_count >= 5 ? "high" : fact.mention_count >= 3 ? "medium" : "low",
      source_event_ids: fact.source_event_ids
    };
  });

  const attention = analysis.alerts.map((alert) => {
    const summary = sourceSummary(alert.source_event_ids, eventById);
    return {
      ...alert,
      title: labelForCategory[alert.category] ?? humanize(alert.category),
      status: "open",
      ...summary,
      explanation: [
        `${summary.mention_count} ${summary.mention_count === 1 ? "atividade relacionada" : "atividades relacionadas"} no período.`,
        `${summary.conversation_count} ${summary.conversation_count === 1 ? "grupo envolvido" : "grupos envolvidos"}.`,
        summary.territories.length > 0
          ? `${summary.territories.length} ${summary.territories.length === 1 ? "território relacionado" : "territórios relacionados"}.`
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
    generated_at: scenario.sent_at,
    scenario: { name: scenario.name, description: scenario.description, synthetic: true },
    overview: {
      event_count: analysis.window.event_count,
      conversation_count: analysis.window.conversation_count,
      territory_count: territoryMap.size,
      fact_count: analysis.facts.length,
      signal_count: analysis.signals.length,
      alert_count: analysis.alerts.length,
      coverage: { status: "simulated", label: "Fonte simulada", percentage: null }
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
      topics: [...territory.topics.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label, count]) => ({ label, count }))
    })).sort((a, b) => b.open_situation_count - a.open_situation_count || b.event_count - a.event_count),
    conversations: [...conversations.values()].map((conversation) => {
      const eventIds = scenario.events.filter((event) => event.conversation_id === conversation.id).map((event) => event.event_id);
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
    recent_events: [...scenario.events]
      .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
      .map((event) => ({
        id: event.event_id,
        conversation: event.conversation_label ?? event.conversation_id,
        territory: event.metadata?.territory ?? null,
        occurred_at: event.occurred_at,
        text: excerpt(event.text, 180)
      })),
    health: {
      status: scenario.heartbeat.status,
      source: scenario.heartbeat.source,
      observed_at: scenario.heartbeat.observed_at,
      outbox_pending: scenario.heartbeat.outbox_pending,
      last_event_captured_at: scenario.heartbeat.last_event_captured_at,
      last_upload_succeeded_at: scenario.heartbeat.last_upload_succeeded_at,
      adapter_version: scenario.heartbeat.adapter_version,
      parser_version: scenario.heartbeat.parser_version
    },
    provenance: {
      pipeline_version: analysis.pipeline_version,
      taxonomy_version: analysis.taxonomy_version,
      warning: "Demonstração com dados sintéticos; não representa cobertura validada do WhatsApp."
    }
  };
};
