import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { canonicalizeConversationEvent } from "../../../supabase/functions/_shared/canonical-conversations.js";
import { buildGroupObservations, groupObservationKey } from "../../../supabase/functions/_shared/group-resolution.js";
import { buildEventGroupLinks, buildGroupMetrics } from "../../../supabase/functions/_shared/group-metrics.js";

// O sensor deriva o id do título com sha256, e o WhatsApp inclui a contagem
// acumulada nesse título. Reproduzir exatamente essa derivação é o que torna o
// teste fiel ao defeito de produção, em vez de um id inventado.
const idDoSensor = (titulo) => `wa_${createHash("sha256").update(titulo).digest("hex").slice(0, 32)}`;

const notificacao = (titulo, indice) => ({
  event_id: `evento-${indice}`,
  source: "android_notification",
  conversation_id: idDoSensor(titulo),
  conversation_label: titulo,
  occurred_at: new Date(Date.parse("2026-09-04T12:00:00.000Z") + indice * 60_000).toISOString()
});

// Título real observado em produção, com o U+200E invisível no início.
const comContagem = (n) => `‎CAMPANHA EUGENIA DEP ESTADUAL (${n} mensagens)`;
const cincoNotificacoes = [258, 259, 260, 261, 262].map((n, i) => notificacao(comContagem(n), i));

test("a derivação do sensor é reproduzida pelo teste", () => {
  // Se esta afirmação quebrar, o teste deixou de descrever o sensor real.
  assert.match(cincoNotificacoes[0].conversation_id, /^wa_[0-9a-f]{32}$/);
  assert.notEqual(cincoNotificacoes[0].conversation_id, cincoNotificacoes[1].conversation_id);
});

test("sem canonicalizar, cinco notificações da mesma conversa viram cinco grupos", () => {
  // Este é o defeito que criou 199 grupos para uma conversa em produção.
  assert.equal(buildGroupObservations(cincoNotificacoes).length, 5);
});

test("canonicalizando antes de resolver, as cinco viram uma", () => {
  const canonicos = cincoNotificacoes.map(canonicalizeConversationEvent);
  const observacoes = buildGroupObservations(canonicos);
  assert.equal(observacoes.length, 1);
  assert.equal(observacoes[0].observed_label, "CAMPANHA EUGENIA DEP ESTADUAL");
  // A chave passa a não depender da contagem nem do caractere invisível.
  assert.equal(new Set(canonicos.map(groupObservationKey)).size, 1);
});

test("a métrica da janela conta uma linha, não cinco", () => {
  const canonicos = cincoNotificacoes.map(canonicalizeConversationEvent);
  const chave = groupObservationKey(canonicos[0]);
  const grupo = "11111111-1111-4111-8111-111111111111";
  const links = buildEventGroupLinks(canonicos, { [chave]: grupo });
  assert.equal(Object.keys(links).length, 5, "os cinco eventos apontam para o mesmo grupo");

  const metricas = buildGroupMetrics({
    events: canonicos,
    analysis: { facts: [], alerts: [] },
    groupLinks: links,
    captureConfidence: { level: "moderate" },
    monitoredGroupIds: [grupo]
  });
  assert.equal(metricas.length, 1);
  assert.equal(metricas[0].event_count, 5);
});

test("conversas realmente distintas continuam separadas", () => {
  const distintas = [
    notificacao("‎CAMPANHA EUGENIA DEP ESTADUAL (12 mensagens)", 0),
    notificacao("‎EQUIPE CASA CAIADA (3 mensagens)", 1),
    notificacao("MOBILIZAÇÃO RIO DOCE", 2)
  ].map(canonicalizeConversationEvent);
  assert.equal(buildGroupObservations(distintas).length, 3);
});

test("a canonicalização não é sensível ao plural nem ao espaçamento do sufixo", () => {
  const variacoes = [
    "‎GRUPO X (1 mensagem)",
    "‎GRUPO X (2 mensagens)",
    "GRUPO X  ",
    "GRUPO X (17 mensagens)"
  ].map((titulo, i) => canonicalizeConversationEvent(notificacao(titulo, i)));
  assert.equal(new Set(variacoes.map(groupObservationKey)).size, 1);
});

test("um título vazio não vira grupo", () => {
  const semTitulo = { ...notificacao("", 0), conversation_label: "" };
  assert.equal(groupObservationKey(canonicalizeConversationEvent(semTitulo)), null);
  assert.equal(buildGroupObservations([canonicalizeConversationEvent(semTitulo)]).length, 0);
});
