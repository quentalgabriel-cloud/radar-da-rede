import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const NETWORK_ID = "d1224e68-c51f-4b31-a7e6-7b91f1a65357";
const DEVICE_ID = "b9717b98-05c9-4bdf-bb3e-95ef50303b34";
const scenarioRoot = resolve(import.meta.dirname, "../../../fixtures/synthetic");

const uuid = (seed) => {
  const chars = createHash("sha256").update(`radar:${seed}`).digest("hex").slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = "8";
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const iso = (value) => new Date(value).toISOString();

const event = ({ scenario, index, conversation, label, text, occurredAt, capturedAt, territory }) => ({
  schema_version: "0.1.0",
  event_id: uuid(`${scenario}:event:${index}`),
  network_id: NETWORK_ID,
  device_id: DEVICE_ID,
  source: "fake",
  source_event_id: `${scenario}:${index}`,
  conversation_id: conversation,
  conversation_label: label,
  occurred_at: iso(occurredAt),
  captured_at: iso(capturedAt ?? new Date(occurredAt).getTime() + 1_000),
  message_type: "text",
  text,
  sender_ref: `actor-${(index % 9) + 1}`,
  parser_version: "0.1.0",
  metadata: { scenario, territory },
});

const scenario = ({ name, description, events, groundTruth, status = "healthy" }) => {
  const last = events.at(-1);
  const sentAt = iso(Date.parse(last.captured_at) + 60_000);
  return {
    schema_version: "0.1.0",
    name,
    description,
    network_id: NETWORK_ID,
    device_id: DEVICE_ID,
    batch_id: uuid(`${name}:batch`),
    sent_at: sentAt,
    events,
    heartbeat: {
      schema_version: "0.1.0",
      heartbeat_id: uuid(`${name}:heartbeat`),
      network_id: NETWORK_ID,
      device_id: DEVICE_ID,
      source: "fake",
      observed_at: iso(Date.parse(sentAt) + 1_000),
      adapter_version: "0.1.0",
      parser_version: "0.1.0",
      status,
      outbox_pending: 0,
      oldest_pending_at: null,
      last_event_captured_at: last.captured_at,
      last_upload_succeeded_at: sentAt,
      counters: { captured: events.length, uploaded: events.length },
    },
    ground_truth: {
      metrics: {
        event_count: events.length,
        conversation_count: new Set(events.map((item) => item.conversation_id)).size,
        ...groundTruth.metrics,
      },
      facts: groundTruth.facts ?? [],
      signals: groundTruth.signals ?? [],
      alerts: groundTruth.alerts ?? [],
      health: { status, ...groundTruth.health },
    },
  };
};

export function generateScenarios() {
  const timeChangeBase = Date.parse("2026-08-27T11:00:00.000Z");
  const eventTimeChange = [
    "A reunião de amanhã será às 18h.",
    "Mudança de horário: a reunião passou para 20h.",
    "Novo horário confirmado para a atividade: 20h.",
    "Todos receberam a atualização.",
  ].map((text, index) => event({
    scenario: "event-time-change",
    index: index + 1,
    conversation: "coordenacao-agenda",
    label: "Coordenação Agenda",
    text,
    occurredAt: timeChangeBase + index * 60_000,
    territory: "rede",
  }));

  const territoryBase = Date.parse("2026-08-27T12:00:00.000Z");
  const territorySpike = [
    "O bairro de Peixinhos pediu nova atividade.",
    "Chegou outra demanda do território de Peixinhos.",
    "A comunidade solicitou presença na rua principal.",
    "Mais uma demanda territorial no bairro de Peixinhos.",
    "A região voltou a pedir apoio hoje.",
  ].map((text, index) => event({
    scenario: "territory-spike",
    index: index + 1,
    conversation: "equipe-peixinhos",
    label: "Equipe Peixinhos",
    text,
    occurredAt: territoryBase + index * 60_000,
    territory: "peixinhos",
  }));

  const topicBase = Date.parse("2026-08-27T13:00:00.000Z");
  const topicGroups = ["rio-doce", "casa-caiada", "bairro-novo", "rio-doce"];
  const topicLabels = ["Mobilização Rio Doce", "Equipe Casa Caiada", "Equipe Bairro Novo", "Mobilização Rio Doce"];
  const sameTopic = [
    "Alguém sabe qual a orientação para o credenciamento?",
    "Dúvida: como fazemos o credenciamento?",
    "Qual a orientação para preencher o credenciamento?",
    "Ainda temos dúvida sobre o credenciamento.",
  ].map((text, index) => event({
    scenario: "same-topic-multiple-groups",
    index: index + 1,
    conversation: topicGroups[index],
    label: topicLabels[index],
    text,
    occurredAt: topicBase + index * 60_000,
    territory: topicGroups[index],
  }));

  const noiseBase = Date.parse("2026-08-27T14:00:00.000Z");
  const noiseHeavy = Array.from({ length: 25 }, (_, index) => {
    const agenda = index === 5 ? "Reunião interna confirmada para 17h." :
      index === 6 ? "A agenda desse encontro foi recebida." :
      `Mensagem de rotina ${index + 1}: recebido e combinado.`;
    const group = index % 5;
    return event({
      scenario: "noise-heavy",
      index: index + 1,
      conversation: `rotina-${group + 1}`,
      label: `Rotina ${group + 1}`,
      text: agenda,
      occurredAt: noiseBase + index * 15_000,
      territory: `zona-${group + 1}`,
    });
  });

  const volumeBase = Date.parse("2026-08-27T15:00:00.000Z");
  const highVolume = Array.from({ length: 120 }, (_, index) => {
    const group = index % 8;
    const text = index < 12
      ? `Solicitação de material e panfletos, registro ${index + 1}.`
      : index < 20
        ? `Reunião de mobilização confirmada para ${17 + (index % 3)}h.`
        : `Registro cotidiano ${index + 1}: combinado.`;
    return event({
      scenario: "high-volume",
      index: index + 1,
      conversation: `volume-${group + 1}`,
      label: `Grupo Volume ${group + 1}`,
      text,
      occurredAt: volumeBase + index * 5_000,
      territory: `volume-${group + 1}`,
    });
  });

  const offlineOccurredBase = Date.parse("2026-08-27T08:00:00.000Z");
  const offlineCapturedBase = Date.parse("2026-08-27T18:00:00.000Z");
  const offlineRecovery = Array.from({ length: 6 }, (_, index) => event({
    scenario: "offline-recovery",
    index: index + 1,
    conversation: `offline-${(index % 2) + 1}`,
    label: `Grupo Offline ${(index % 2) + 1}`,
    text: `Registro offline ${index + 1}: recebido e combinado.`,
    occurredAt: offlineOccurredBase + index * 60_000,
    capturedAt: offlineCapturedBase + index * 1_000,
    territory: `offline-${(index % 2) + 1}`,
  }));

  return [
    scenario({
      name: "event-time-change",
      description: "Mudança operacional de horário dentro de um grupo.",
      events: eventTimeChange,
      groundTruth: {
        facts: [{ category: "agenda_mobilizacao", conversation_count: 1, minimum_mentions: 3 }],
        signals: [{ kind: "schedule_change", category: "agenda_mobilizacao", severity: "medium" }],
        alerts: [{ kind: "schedule_change", category: "agenda_mobilizacao", severity: "medium" }],
      },
    }),
    scenario({
      name: "territory-spike",
      description: "Pico de demandas concentradas em um território.",
      events: territorySpike,
      groundTruth: {
        facts: [{ category: "demanda_territorial", conversation_count: 1, minimum_mentions: 5 }],
        signals: [{ kind: "territory_spike", category: "demanda_territorial", severity: "high" }],
      },
    }),
    scenario({
      name: "same-topic-multiple-groups",
      description: "A mesma dúvida aparece em três grupos.",
      events: sameTopic,
      groundTruth: {
        facts: [{ category: "duvida_orientacao", conversation_count: 3, minimum_mentions: 4 }],
        signals: [{ kind: "cross_group_recurrence", category: "duvida_orientacao", severity: "high" }],
      },
    }),
    scenario({
      name: "noise-heavy",
      description: "Muito ruído cotidiano com um movimento de agenda não crítico.",
      events: noiseHeavy,
      groundTruth: {
        facts: [{ category: "agenda_mobilizacao", conversation_count: 2, minimum_mentions: 2 }],
      },
    }),
    scenario({
      name: "high-volume",
      description: "Batch grande com recorrências reais misturadas a muito ruído.",
      events: highVolume,
      groundTruth: {
        facts: [
          { category: "material_logistica", conversation_count: 8, minimum_mentions: 12 },
          { category: "agenda_mobilizacao", conversation_count: 8, minimum_mentions: 8 },
        ],
        signals: [
          { kind: "cross_group_recurrence", category: "material_logistica", severity: "high" },
          { kind: "cross_group_recurrence", category: "agenda_mobilizacao", severity: "high" },
        ],
      },
    }),
    scenario({
      name: "offline-recovery",
      description: "Eventos preservam o horário original após dez horas offline.",
      events: offlineRecovery,
      status: "offline_recovery",
      groundTruth: {
        metrics: { minimum_capture_delay_seconds: 35_000 },
        health: { status: "offline_recovery" },
      },
    }),
  ];
}

export async function writeScenarios() {
  for (const item of generateScenarios()) {
    const directory = resolve(scenarioRoot, item.name);
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, "scenario.json"), `${JSON.stringify(item, null, 2)}\n`, "utf8");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeScenarios();
  console.log("generated 6 deterministic Radar scenarios");
}
