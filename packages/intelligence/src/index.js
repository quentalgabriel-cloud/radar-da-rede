export const TAXONOMY_VERSION = "0.1.0";
export const PIPELINE_VERSION = "0.1.0";

const CATEGORY_RULES = [
  {
    category: "material_logistica",
    patterns: [/(?:panfleto|material|adesiv|bandeira|camiseta|reposi[cç][aã]o|entrega)/i]
  },
  {
    category: "agenda_mobilizacao",
    patterns: [/(?:reuni[aã]o|agenda|evento|atividade|hor[aá]rio|\b\d{1,2}h\b)/i]
  },
  {
    category: "duvida_orientacao",
    patterns: [/(?:como fazemos|qual a orienta[cç][aã]o|algu[eé]m sabe|d[uú]vida)/i]
  },
  {
    category: "demanda_territorial",
    patterns: [/(?:territ[oó]rio|bairro|regi[aã]o|rua|comunidade)/i]
  },
  {
    category: "problema_operacional",
    patterns: [/(?:equipe (?:est[aá] )?parada|bloquead|n[aã]o funciona|falha|gargalo|atras)/i]
  },
  {
    category: "alegacao_verificar",
    patterns: [/(?:disseram que|parece que|precisa verificar|confirma essa informa[cç][aã]o)/i]
  }
];

const classify = (event) => {
  if (typeof event.text !== "string") return [];
  return CATEGORY_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(event.text)))
    .map((rule) => rule.category);
};

const severityFor = ({ conversation_count: conversationCount, mention_count: mentionCount }) => {
  if (conversationCount >= 3 || mentionCount >= 5) return "high";
  if (conversationCount >= 2 || mentionCount >= 3) return "medium";
  return "low";
};

export const analyzeEvents = (events) => {
  const sorted = [...events].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  const byCategory = new Map();

  for (const event of sorted) {
    for (const category of classify(event)) {
      const bucket = byCategory.get(category) ?? { events: [], conversations: new Set() };
      bucket.events.push(event);
      bucket.conversations.add(event.conversation_id);
      byCategory.set(category, bucket);
    }
  }

  const facts = [...byCategory.entries()].map(([category, bucket]) => ({
    fact_version: PIPELINE_VERSION,
    taxonomy_version: TAXONOMY_VERSION,
    category,
    mention_count: bucket.events.length,
    conversation_count: bucket.conversations.size,
    conversation_ids: [...bucket.conversations].sort(),
    source_event_ids: bucket.events.map((event) => event.event_id),
    first_seen_at: bucket.events[0].occurred_at,
    last_seen_at: bucket.events.at(-1).occurred_at,
    extraction_method: "deterministic_rules"
  })).sort((a, b) => b.mention_count - a.mention_count || a.category.localeCompare(b.category));

  const signals = facts
    .filter((fact) => fact.conversation_count >= 2 && fact.mention_count >= 3)
    .map((fact) => ({
      signal_version: PIPELINE_VERSION,
      kind: "cross_group_recurrence",
      category: fact.category,
      severity: severityFor(fact),
      source_event_ids: fact.source_event_ids,
      evidence: {
        mention_count: fact.mention_count,
        conversation_count: fact.conversation_count
      }
    }));

  const territoryFact = facts.find((fact) =>
    fact.category === "demanda_territorial" && fact.mention_count >= 4
  );
  if (territoryFact && territoryFact.conversation_count === 1) {
    signals.push({
      signal_version: PIPELINE_VERSION,
      kind: "territory_spike",
      category: territoryFact.category,
      severity: severityFor(territoryFact),
      source_event_ids: territoryFact.source_event_ids,
      evidence: {
        mention_count: territoryFact.mention_count,
        conversation_count: territoryFact.conversation_count
      }
    });
  }

  const scheduleChangeEvents = sorted.filter((event) =>
    typeof event.text === "string" &&
      /(?:mudan[cç]a de hor[aá]rio|novo hor[aá]rio|passou para|adiad[ao]|cancelad[ao])/i.test(event.text)
  );
  if (scheduleChangeEvents.length > 0) {
    signals.push({
      signal_version: PIPELINE_VERSION,
      kind: "schedule_change",
      category: "agenda_mobilizacao",
      severity: "medium",
      source_event_ids: scheduleChangeEvents.map((event) => event.event_id),
      evidence: { change_mentions: scheduleChangeEvents.length }
    });
  }

  const alerts = [];
  const materialSignal = signals.find((signal) => signal.category === "material_logistica" && signal.severity === "high");
  const blockerEvents = sorted.filter((event) =>
    typeof event.text === "string" && /(?:parad[ao]|bloquead[ao]|aguardando|n[aã]o chegou)/i.test(event.text)
  );
  if (materialSignal && blockerEvents.length > 0) {
    alerts.push({
      alert_version: PIPELINE_VERSION,
      kind: "operational_blocker",
      category: "material_logistica",
      severity: "high",
      source_event_ids: [...new Set([...materialSignal.source_event_ids, ...blockerEvents.map((event) => event.event_id)])],
      reason: "Falta de material recorrente em vários grupos com indicação de bloqueio operacional."
    });
  }
  if (scheduleChangeEvents.length > 0) {
    alerts.push({
      alert_version: PIPELINE_VERSION,
      kind: "schedule_change",
      category: "agenda_mobilizacao",
      severity: "medium",
      source_event_ids: scheduleChangeEvents.map((event) => event.event_id),
      reason: "Uma mudança explícita de horário pode exigir atualização rápida da coordenação."
    });
  }

  return {
    pipeline_version: PIPELINE_VERSION,
    taxonomy_version: TAXONOMY_VERSION,
    window: {
      starts_at: sorted[0]?.occurred_at ?? null,
      ends_at: sorted.at(-1)?.occurred_at ?? null,
      event_count: sorted.length,
      conversation_count: new Set(sorted.map((event) => event.conversation_id)).size
    },
    facts,
    signals,
    alerts
  };
};

export const compareWithGroundTruth = (analysis, groundTruth) => {
  const misses = [];
  for (const expected of groundTruth.facts ?? []) {
    const actual = analysis.facts.find((fact) => fact.category === expected.category);
    if (!actual) misses.push(`missing fact ${expected.category}`);
    else {
      if (actual.conversation_count < expected.conversation_count) {
        misses.push(`${expected.category}: expected ${expected.conversation_count} conversations, got ${actual.conversation_count}`);
      }
      if (actual.mention_count < expected.minimum_mentions) {
        misses.push(`${expected.category}: expected at least ${expected.minimum_mentions} mentions, got ${actual.mention_count}`);
      }
    }
  }
  for (const expected of groundTruth.signals ?? []) {
    const actual = analysis.signals.find((signal) => signal.kind === expected.kind && signal.category === expected.category);
    if (!actual) misses.push(`missing signal ${expected.kind}:${expected.category}`);
    else if (actual.severity !== expected.severity) misses.push(`${expected.kind}:${expected.category}: expected ${expected.severity}, got ${actual.severity}`);
  }
  for (const expected of groundTruth.alerts ?? []) {
    const actual = analysis.alerts.find((alert) => alert.kind === expected.kind && alert.category === expected.category);
    if (!actual) misses.push(`missing alert ${expected.kind}:${expected.category}`);
    else if (actual.severity !== expected.severity) misses.push(`${expected.kind}:${expected.category}: expected ${expected.severity}, got ${actual.severity}`);
  }
  if ((groundTruth.signals ?? []).length === 0 && analysis.signals.length > 0) {
    misses.push(`unexpected signals: ${analysis.signals.map((signal) => signal.kind).join(", ")}`);
  }
  if ((groundTruth.alerts ?? []).length === 0 && analysis.alerts.length > 0) {
    misses.push(`unexpected alerts: ${analysis.alerts.map((alert) => alert.kind).join(", ")}`);
  }
  return { passed: misses.length === 0, misses };
};
