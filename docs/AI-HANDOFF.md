# Handoff para continuidade por qualquer LLM

> **LEIA PRIMEIRO: "GO-LIVE DE 2026-09-07", no fim deste arquivo.**
> É a seção corrente. As seções anteriores continuam válidas como histórico,
> mas seus próximos passos e estados de flag foram substituídos pelo go-live.

- Atualizado em: 2026-09-07, go-live do Painel de Controle na `main`
- **Comece pela seção final** — o corpo do documento acima ainda descreve estado pré-consolidação em vários pontos; a seção final tem a versão corrente
- Branch corrente: `main`; PR [#24](https://github.com/quentalgabriel-cloud/radar-da-rede/pull/24) mesclado
- Merge de go-live: `5dbeb073d01e325039460d375589fb37264af66a`
- Projeto Supabase: `pluruijhqnueayrlkthx`
- Rede piloto: `d1224e68-c51f-4b31-a7e6-7b91f1a65357`
- Produção web: `https://radar-da-rede.vercel.app`

## Estado executivo

A fase corrente continua sendo **P1.1**. Não avance para P2.

**Este parágrafo e a tabela abaixo descrevem o estado em 2026-09-03 e estão
superados em pontos específicos — leia "ENCERRAMENTO DA SESSÃO DE 2026-09-04"
antes de agir.** Resumo do que mudou: as Edge Functions já estão implantadas
(não são mais "as antigas"); o registry de grupos, que tinha 206 grupos para
poucas conversas reais, foi consolidado para 8; e a vigilância operacional
(`operational-health`) passou a existir e a rodar limpa. O Control Center
continua desligado, agora por decisão de coordenação/timing, não mais pelo
registry inflado.

Relatório completo da sessão de 2026-09-03: `docs/P1.1-EXECUTION-REPORT.md`.
Relatório desta sessão (2026-09-04): seção "ENCERRAMENTO" ao final deste
arquivo e `docs/GROUP-IDENTITY-PLAN.md`.

## Evidência remota mais recente

| Item | Valor observado em 2026-09-03 |
|---|---:|
| eventos | 1.064 |
| batches | 175 |
| grupos | 151 (eram 124; ver nota abaixo) |
| grupos confirmados | 0 |
| aliases ambíguos | 0 |
| métricas P1 (`group_metric_windows`) | 30 |
| execuções (`processing_runs`) | 9 (1 `canonical_slot`, 8 `legacy_on_read`) |
| redes com Control Center ativo | 0 |
| credenciais de processamento ativas | 1 (`p11-sched`) |
| amostras em `capture_health_samples` | 1 (primeiro heartbeat real após a migration) |
| último heartbeat | 2026-09-03 19:52:02 UTC |
| último evento | 2026-09-03 16:35:36 UTC |
| último processamento | 2026-09-03 19:42:11 UTC |

Funções implantadas: `process-window` v5, `process-latest-window` v6,
`radar-read-model` v12, `ingest-events` v2, `ingest-health` v2,
`capture-diagnostic` v1. **Nenhuma foi atualizada nesta sessão.**

Migrations aplicadas: 11. As duas novas são `capture_coverage_and_run_anchor` e
`processing_run_legacy_window_provenance`. Elas são compatíveis com as funções
antigas — comprovado por uma execução real depois da aplicação.

O registry passou de 124 para 151 grupos. Isso é o comportamento previsto do
resolvedor shadow da P0: cada processamento registra as conversas observadas
pela primeira vez. Como o último processamento anterior era de 2026-09-02, a
janela consolidada nesta sessão trouxe 27 conversas novas, com primeiro evento
entre 2026-09-02 22:59 e 2026-09-03 15:40 UTC. Nenhum evento histórico recebeu
backfill de identidade e nenhum grupo foi fundido por semelhança de nome.

Consequência prática: as 30 linhas de métrica cobrem 30 dos 151 grupos. Depois
do deploy, uma execução deve produzir uma linha por grupo ativo.

Confirme tudo novamente antes de alterar.

## Próxima ação exata

**Fazer o release coordenado da P1.1**, seguindo `docs/RUNBOOK-P1.1-RELEASE.md`,
que traz os comandos exatos, já conferidos na máquina de operação. As três
funções precisam ir juntas e depois dos secrets, nesta ordem:

1. Configurar os três GitHub Actions Secrets em
   `quentalgabriel-cloud/radar-da-rede` (Settings → Secrets and variables →
   Actions):
   - `RADAR_SUPABASE_URL` = `https://pluruijhqnueayrlkthx.supabase.co`
   - `RADAR_NETWORK_ID` = `d1224e68-c51f-4b31-a7e6-7b91f1a65357`
   - `RADAR_PROCESSING_SECRET` = credencial `p11-sched` já criada
     (id `9a54b2a1-eeb8-45b7-b1f6-cdaa38e11cce`; somente o SHA-256 está no banco).
     O valor foi entregue em arquivo local fora do repositório; se ele não
     existir mais, **rotacione** em vez de tentar recuperá-lo.
2. Rodar `Consolidate Radar` manualmente e confirmar que o job fica verde e
   grava o sumário com `run_id`, janela, contagens e duração. Depois remover
   temporariamente um secret e confirmar que o job fica **vermelho**.
3. Implantar as três Edge Functions a partir do repositório, com a CLI, para
   garantir identidade byte a byte com `main`:
   `supabase functions deploy process-window process-latest-window radar-read-model --project-ref pluruijhqnueayrlkthx`.
   Não implante `radar-read-model` antes do passo 2: ela deixa de consolidar ao
   responder GET, e sem scheduler funcionando a produção ficaria sem atualização.
4. Executar uma janela canônica com o código novo e conferir no banco:
   - `group_metric_windows` com uma linha para **cada** grupo ativo (151 no
     momento desta escrita), não apenas para os que tiveram evento;
   - `processing_runs.capture_confidence` e `capture_coverage` preenchidos;
   - `window_kind = 'canonical_slot'`.
5. ~~Segunda janela comparável~~ — feito em 2026-09-03: a comparadora `7bd73774`
   foi produzida pelo código corrigido e a política a escolhe corretamente. A
   tendência ainda é suprimida por cobertura insuficiente, não por falta de
   comparadora. Primeira tendência real estimada para 2026-09-05, slot das 08:00
   de Recife. Ver seção 12 de `docs/P1.1-EXECUTION-REPORT.md`.
6. Só então seguir para E2E de navegador, matriz de campo do Moto G84, SLOs e
   piloto.

## Bloqueios que não podem ser ignorados

1. ~~Secrets do GitHub~~ — resolvido em 2026-09-03: os três estão configurados e o scheduler foi provado nos dois caminhos.
2. ~~Edge Functions antigas~~ — resolvido em 2026-09-03: `process-window` v6, `process-latest-window` v7 e `radar-read-model` v13 estão implantadas e o read model foi conferido byte a byte contra o repositório.
3. Não existem SLOs nem alertas para heartbeat atrasado, processamento atrasado
   ou execução pulada.
4. A série de amostras tem uma única linha: começou às 19:52 UTC de 2026-09-03.
   Enquanto não houver algumas horas de histórico, a cobertura de qualquer
   janela de 24 h será baixa por falta de amostras, e não por falha de captura.
5. A credencial do dispositivo está embutida em claro no APK público. **Risco
   aceito** em 2026-09-03 por Gabriel Quental, registrado em `docs/DECISIONS.md`
   como D-021: o dispositivo está sob controle físico e a rede é piloto.
   **Não rotacione nem torne o repositório privado sem falar com ele.** A
   integridade do sinal passa a depender de detecção: qualquer volume ou origem
   não explicados pelo aparelho devem ser tratados como possível injeção. A
   consulta de acompanhamento está em `docs/ANDROID-FIELD-EVIDENCE.md`.
6. O sensor em operação **não** é `apps/android-sensor`. A fonte é
   `quentalgabriel-cloud/radar-sensor-probe`, projeto Java independente. O
   módulo Kotlin deste monorepo nunca produziu a build de campo e hoje é código
   morto que aparenta ser o sensor de produção (D20). A matriz de campo deve
   apontar para o probe.
7. Falta E2E real de navegador. A matriz dirigida de campo agora é possível,
   mas contra o repositório do probe, não contra este monorepo.
8. Retenção de `capture_health_samples` não foi definida.

## Gate para ativar o Control Center

- scheduler executa e falha de forma visível;
- existem duas janelas reais comparáveis, produzidas pelo código corrigido;
- inatividade/zero estão ancorados à execução atual;
- confidence mede cobertura do período;
- read model é somente leitura;
- paridade, integração, E2E e campo foram aprovados;
- vocabulário/horizonte foram validados com a coordenação;
- rollback foi testado.

Estado item a item em `docs/P1.1-EXECUTION-REPORT.md`, seção 7.
Até lá, `group_control_center_enabled=false`.

## Decisões desta sessão

- Política de comparação: `same_slot_previous_day@1`, com tolerância de 30 min
  para atraso do scheduler e 5 min de diferença de duração. Janelas móveis
  adjacentes nunca são comparadas.
- Cobertura de captura: `capture_coverage@1`, medida em amostras append-only com
  tolerância de 35 min entre amostras (cadência de 15 min do sensor). Vários
  dispositivos são combinados por união de intervalos cobertos.
- Falta de campos de configuração degrada a confiança para `moderate` em vez de
  zerá-la, para que a ausência de evidência não apague todo o sinal.
- Execuções antigas criadas pelo GET foram marcadas `legacy_on_read`, para que
  uma janela arbitrária nunca vire comparadora.
- Refresh manual continua existindo, mas exige papel operator/owner e respeita
  limite de cinco minutos.
- “Situações abertas” virou “situações no período”. Nenhum ciclo de resolução
  foi criado.
- Engine canônica em `packages/group-analytics`, com cópia Edge gerada e
  verificada byte a byte no CI.

## Decisões que não devem ser reabertas sem evidência nova

- operação ativa substituiu o antigo gate pré-operação;
- não existe aprovação jurídica externa como gate;
- análise política, sentimento e segmentação agregada são permitidos;
- perfil individual, intenção de voto, CRM e disparo automático estão fora do escopo;
- eventos históricos não recebem backfill de grupo por label;
- P2 será dividida em P2A determinística e P2B experimental;
- linguagem natural nunca executa SQL livre.

## Qualidade conhecida

`corepack pnpm verify` verde em 2026-09-03: 120 testes (eram 83), checks e
builds dos 12 pacotes. Novos testes cobrem âncora, comparação, cobertura,
cadeia de RPC, configuração do workflow e paridade. Migration aplicada em
produção com verificação transacional revertida da ingestão de heartbeat.
Advisors de segurança executados: nenhum achado novo.

Isso prova implementação e teste local. Não prova os gates remotos.

## Rollback conhecido

- UI: `group_control_center_enabled=false`;
- métricas: `GROUP_METRICS_SHADOW_ENABLED=false` volta à RPC v1;
- RPC: a cadeia `persist_analysis_v3 → v2 → persist_analysis` degrada sozinha se
  uma versão não existir, então remover a v3 é um rollback válido;
- funções: versões anteriores registradas são process-window v5,
  process-latest-window v6 e read-model v12 (as que estão implantadas hoje);
- credencial: `update public.processing_credentials set revoked_at = now() where id = '9a54b2a1-eeb8-45b7-b1f6-cdaa38e11cce';`
  Isso interrompe a consolidação e **não** afeta a ingestão do Android, que usa
  `device_credentials`;
- migration: `capture_health_samples` e as colunas novas de `processing_runs`
  podem ser removidas sem quebrar as funções antigas, mas só depois de reverter
  qualquer função que já use a v3;
- não remover a tabela de métricas antes de reverter consumidores.

Confirme o inventário no ambiente antes de qualquer rollback.

## Documentos essenciais

- `AGENTS.md`
- `docs/PRODUCT-COMPLETION-ROADMAP.md`
- `docs/implementation-prompts/P1.1-CONFIABILIDADE-E-ATIVACAO.md`
- `docs/RUNBOOK-P1.1-RELEASE.md`
- `docs/P1.1-EXECUTION-REPORT.md`
- `docs/P0-CLOSURE-REPORT.md`
- `docs/P1-EXECUTION-REPORT.md`
- `docs/DEEP_IMPLEMENTATION_IMPACT_REVIEW.md`
- `docs/PROJECT.md`
- `docs/SUPABASE.md`
- `docs/DEPLOYMENTS.md`
- `docs/DATA_GOVERNANCE.md`

## Obrigação de encerramento

Antes de parar, atualize este arquivo com data/commit, mudanças,
migrations/functions/APK/flags, testes realmente executados, métricas atuais,
bloqueios, próxima ação única e rollback. Não deixe decisões relevantes apenas
em chat.

## Primeira verificação da próxima sessão

Antes de qualquer outra coisa, medir a cadência noturna das amostras de captura.
Às 22:01 UTC de 2026-09-03 o intervalo desde a última amostra era de 33,2
minutos, contra 3,6 de média diurna, perto do limite de 35 adotado em
`capture_coverage@1`. A consulta está na seção 12 de
`docs/P1.1-EXECUTION-REPORT.md`.

Se algum intervalo noturno passar de 35 minutos, decidir entre ajustar a
tolerância com justificativa medida ou tratar a lacuna como perda real de
cobertura. Não ajustar a tolerância apenas para melhorar a métrica.

---

# ENCERRAMENTO DA SESSÃO DE 2026-09-04 — LEIA ISTO PRIMEIRO

## O que esta sessão fez

Executou `docs/GROUP-IDENTITY-PLAN.md`, etapas 1 a 3, na ordem prescrita. Cada
etapa só começou depois que a anterior estava mesclada e implantada.

### Etapa 1 — estancar (PR [#11](https://github.com/quentalgabriel-cloud/radar-da-rede/pull/11))

`process-window` e `process-latest-window` passaram a canonicalizar o evento
(`canonicalizeConversationEvent`) **antes** de resolver grupo, não só na
análise. **VALIDADO REMOTAMENTE**: reprocessamento contra produção confirmou
zero grupo novo a partir de eventos já vistos.

### Etapa 2 — proteger (PRs [#11](https://github.com/quentalgabriel-cloud/radar-da-rede/pull/11) e [#12](https://github.com/quentalgabriel-cloud/radar-da-rede/pull/12))

Edge Function `operational-health` nova (leitura pura, sem `SUPABASE_SERVICE_ROLE_KEY`
no workflow) mede `groupsCreatedLast24h` contra `distinctConversationsLast24h`.
Rodar contra produção expôs um defeito autoral: a primeira versão contava
`conversation_id` bruto (o id volátil) como "conversa", comparando inflado
contra inflado. Corrigido no #12 para canonicalizar o rótulo antes de contar.
**VALIDADO REMOTAMENTE.**

### Etapa 3 — consolidar (PR [#13](https://github.com/quentalgabriel-cloud/radar-da-rede/pull/13))

Nova função `private.consolidate_group_registry`, com ensaio (`p_apply` ausente)
antes de aplicar. Ver decisão completa em D-023 em `docs/DECISIONS.md`.

Aplicada em produção: **206 grupos ativos → 8.** 198 fusões registradas em
`group_merge_map` com prova por linha. As 8 janelas canônicas foram
reprocessadas pelo caminho de produção — nenhuma métrica foi somada à mão.

Rodar a vigilância depois da consolidação expôs um segundo defeito: o guardrail
contava `created_at` de grupo arquivado como se fosse novo, porque a
consolidação passou a arquivar em vez de excluir. Corrigido no mesmo PR e
confirmado contra produção: vigilância foi de `registry_inflating` (excedente
53) para **sem problemas**. **VALIDADO REMOTAMENTE**, com a vigilância como
prova, não com leitura pontual.

## Estado real, com nível de evidência

| Gate / etapa | Estado |
|---|---|
| Etapa 1 (estancar) | **VALIDADO REMOTAMENTE** |
| Etapa 2 (guardrail) | **VALIDADO REMOTAMENTE** — vigilância limpa após duas correções próprias |
| Etapa 3 (consolidar) | **VALIDADO REMOTAMENTE** — aplicada, reprocessada, conferida linha a linha |
| Etapa 4 (sensor: canonicalizar na origem, `shortcutId`, config no heartbeat) | **PENDENTE** — não iniciada; repositório é outro (`radar-sensor-probe`) |
| Etapa 5 (ligar Control Center) | **PENDENTE** — tecnicamente destravada pela etapa 3, mas ver "Sobre ligar" abaixo |
| Gates 1/3/4/5 do P1.1 (scheduler, âncora, cobertura, read model puro) | **VALIDADO REMOTAMENTE**, herdado de sessões anteriores, sem regressão nesta |
| Gate 2 (duas janelas comparáveis, tendência real) | mecanismo fechado; primeira tendência esperada a partir de 2026-09-05 — **ainda não conferida nesta sessão** |
| Gate "campo" (equipe usando, E2E de campo) | **PENDENTE** — nada nesta sessão substitui uso real |

## Evidência remota mais recente (2026-09-04, ~19:45 UTC)

| Item | Valor |
|---|---:|
| eventos (`normalized_events`) | 1.510 |
| batches | 246 |
| grupos ativos | **8** (eram 206 no início da sessão) |
| grupos arquivados | 198 |
| linhas de métrica (`group_metric_windows`) | 122 |
| execuções (`processing_runs`) | 26 (18 `canonical_slot`) |
| credenciais de processamento ativas | 1 |
| amostras em `capture_health_samples` | 149 |
| último heartbeat | 2026-09-04 19:34:03 UTC |
| último evento | 2026-09-04 19:34:00 UTC |
| último processamento | 2026-09-04 19:43:08 UTC |
| `group_control_center_enabled` | `false` |

Funções implantadas: `process-window` v8, `process-latest-window` v9,
`radar-read-model` v13 (sem mudança nesta sessão), `operational-health` v4
(nova nesta sessão, com duas correções). `ingest-events` v2, `ingest-health` v2
sem mudança.

`pnpm verify`: 156 testes, todos verdes, checks e builds dos 12 pacotes.

## Pull requests

Mesclados nesta sessão: [#11](https://github.com/quentalgabriel-cloud/radar-da-rede/pull/11), [#12](https://github.com/quentalgabriel-cloud/radar-da-rede/pull/12), [#13](https://github.com/quentalgabriel-cloud/radar-da-rede/pull/13).

**Ainda abertos, de sessões anteriores, aguardando decisão do dono:**
- [#5](https://github.com/quentalgabriel-cloud/radar-da-rede/pull/5) — documentação de fechamento de 2026-09-03. Conteúdo majoritariamente superado por este handoff; revisar se ainda vale mesclar ou fechar sem mesclar.
- [#10](https://github.com/quentalgabriel-cloud/radar-da-rede/pull/10) — etapa 1 validada e nota sobre o cron do GitHub entregar só 2 de 6 slots. A decisão de mover para `pg_cron` continua em aberto (ver abaixo).

## Bloqueios que não podem ser ignorados

1. **Decisão de scheduler pendente**: o cron do GitHub Actions entregou 2 de 6
   slots em pelo menos um dia observado. A vigilância (`scheduler_under_delivering`)
   mede isso, mas não conserta. Mover para `pg_cron` dentro do Supabase
   resolveria a entrega, e a decisão pendente é sobre onde a credencial de
   processamento passaria a viver — ver PR #10.
2. **Etapa 4 (sensor) não começou.** O repositório de produção é
   `quentalgabriel-cloud/radar-sensor-probe`, não este monorepo. Até lá, toda
   conversa nova continua nascendo com id volátil — a etapa 3 corrige o
   passado, não impede reincidência na origem. A etapa 1 (canonicalizar antes
   de resolver) já impede a reincidência **no registry**, mas o sensor
   continuará gerando um hash novo por notificação até a etapa 4.
3. **Credencial do dispositivo em claro no APK** — risco aceito (D-021), não
   revisado nesta sessão. Não rotacionar nem tornar o repositório privado sem
   falar com o dono.
4. **Vocabulário/horizonte da tela não foi validado com a coordenação** — a
   equipe começou a usar o sistema em 2026-09-04 (sexta), mas não há registro
   nesta sessão de feedback deles sobre nomenclatura ou período padrão.

## Sobre ligar o Control Center agora

Não foi ligado nesta sessão. Antes da etapa 3, o motivo era o registry mostrar
~196 linhas para uma conversa real — isso está resolvido.

O que falta agora é mais simples: confirmar que a equipe, usando o sistema
desde ontem, não tem objeção de vocabulário pendente, e que a etapa 4 do sensor
(ou pelo menos um plano para ela) não vai reabrir a mesma inflação em poucos
dias. Ligar sem a etapa 4 significa que o registry vai recomeçar a crescer a
cada notificação nova — devagar, porque a etapa 1 barrou o caminho do
registry, mas o sensor ainda emite um id novo por notificação, então cada
conversa ainda gera *algum* volume de aliases (não de grupos, porque a etapa 1
resolve para o grupo certo) até a etapa 4 estabilizar a origem.

Ligar continua sendo:
```sql
update public.networks set group_control_center_enabled = true
where id = 'd1224e68-c51f-4b31-a7e6-7b91f1a65357';
```
Desligar é o mesmo com `false` — rollback imediato, sem deploy.

## Próxima ação exata

1. Decidir o scheduler (`pg_cron` vs. manter GitHub Actions) — PR #10 traz o
   diagnóstico.
2. Iniciar a etapa 4 no repositório `radar-sensor-probe`: canonicalizar antes
   do hash, reportar `notification_access`/`whatsapp_installed`/`network_type`,
   avaliar `getShortcutId()`. Ver `docs/GROUP-IDENTITY-PLAN.md`, seção 4.
3. Com a coordenação, confirmar vocabulário e decidir ligar o Control Center
   (etapa 5) para a rede piloto.
4. Em 2026-09-05, conferir a primeira tendência real (gate 2) — nada a fazer
   até lá além de não mexer na tolerância de cobertura.
5. Revisar os PRs #5 e #10 abertos: mesclar, atualizar ou fechar.

---

# ENCERRAMENTO DA SESSÃO DE 2026-09-05 — LEIA ISTO PRIMEIRO

## O que esta sessão fez

Duas coisas, nesta ordem: pesquisou e escreveu o plano da próxima etapa
(`docs/P1.3-PLANO-PROXIMA-ETAPA.md`, PR #16, **aberto, não mesclado**), e
implementou a única parte desse plano que não dependia de decisão do dono do
produto (PR #17, **mesclado**).

### O achado que mudou a prioridade

Verificando produção em vez de confiar no handoff anterior, esta sessão
encontrou o **agendador automático parado havia ~19h** (nenhuma execução
`schedule` do GitHub Actions em nenhum dos dois workflows desde
2026-09-04 ~19h) — e a vigilância operacional relatando `"sem problemas"`
apesar disso, por dois motivos que se mascaravam ao mesmo tempo: um refresh
manual recente deixava a "última consolidação" parecer fresca, e o
reprocessamento manual da etapa 3 (oito janelas antigas reprocessadas na
mesma sessão) inflava a contagem de "janelas canônicas em 24h" sem que
nenhum slot novo tivesse sido entregue.

### O que o PR #17 corrigiu — VALIDADO REMOTAMENTE

`operational-health` ganhou um terceiro sinal, independente dos outros dois:
o `ends_at` da janela canônica mais recente, consultado sem filtro de tempo.
Reprocessar uma janela antiga reafirma o mesmo `ends_at` — não cria um novo
— então essa idade só encolhe quando o agendador entrega, de fato, um slot
nunca processado antes. Reproduzido em teste com o snapshot real de
2026-09-05 e **confirmado contra produção depois do deploy**: a função
passou a reportar `scheduler_stalled` (1370 min desde a última janela
canônica) exatamente enquanto os outros dois números continuavam parecendo
saudáveis.

**O agendador continua parado.** Este PR corrige a cegueira da vigilância;
não conserta o agendador em si. A causa raiz de por que o `schedule:` do
GitHub Actions parou de disparar não foi diagnosticada.

### O achado do PR #16 que muda o desenho da etapa 4

Verificando o código de resolução de grupo, esta sessão encontrou que a
resolução hoje **ignora completamente** o `conversation_id` que o sensor
envia — `canonicalizeConversationEvent` sempre sobrescreve com
`label:<rótulo canônico>` antes de resolver
(`supabase/functions/_shared/canonical-conversations.js:16-26`, chave de
resolução em `supabase/functions/_shared/group-resolution.js:12`). Isso
significa que a etapa 4 (`shortcutId` no sensor), do jeito que está descrita
em `docs/GROUP-IDENTITY-PLAN.md`, **não teria efeito nenhum na resolução**
sem uma mudança correspondente no backend — o plano existente descreve só a
metade do sensor. Detalhe completo, com a cadeia de código citada linha a
linha, na seção 2.2 do plano.

### Gabriel deu aval para 6.1 e 6.4 — implementados e VALIDADOS REMOTAMENTE, ainda na mesma sessão

Com o plano em mãos, o Gabriel aprovou implementar as duas perguntas da
seção 6 que não dependiam de mais ninguém: 6.1 (fonte do agendamento) e 6.4
(deploy automático). 6.2 (vocabulário) ficou como mensagem pronta pra ele
mandar à equipe quando puder — não é algo que se decide por código. 6.3
(rotação de credencial do sensor) continua parado, por escolha: só importa
quando a etapa 4 começar de verdade.

**D-024 e D-025 em `docs/DECISIONS.md` têm a decisão completa.** Resumo:

- `private.radar_cron_consolidate()` — dispara `process-window` de dentro do
  Supabase via `pg_cron`+`pg_net`, nos mesmos seis horários que o workflow
  usava. Credencial nova, gerada inteiramente dentro de uma transação SQL
  (nunca em texto puro fora do banco). `consolidate.yml` perdeu o
  `schedule:`, fica só `workflow_dispatch`;
- `private.radar_cron_health_check()` — mesma ideia para a checagem de
  saúde, mas **em paralelo** com `operational-health.yml`, não em
  substituição: o workflow falha visivelmente (X vermelho) e um cron dentro
  do banco não tem esse sinal por natureza. Uma primeira versão tentou
  capturar a resposta de forma síncrona (`net.http_collect_response`) e
  travou em teste manual, mesmo com o worker do `pg_net` confirmadamente
  ativo; simplificada para dispara-e-esquece, o mesmo padrão já provado. A
  trilha crua fica em `net._http_response` (retenção curta, mantida pelo
  próprio `pg_net`), filtrando por `url like '%/operational-health%'`;
- `deploy-functions.yml` — roda `pnpm verify` e implanta todas as Edge
  Functions a cada push em `main` que toque `supabase/functions/**`. Fecha o
  intervalo de ~15h que deixou a etapa 1 corrigida em `main` sem valer em
  produção, em 2026-09-04. Precisa do secret `SUPABASE_ACCESS_TOKEN`, que o
  Gabriel já adicionou.

**Confirmado contra produção, não só localmente:** disparei
`private.radar_cron_consolidate()` manualmente, esperei o `net.http_post`
assíncrono completar, e uma linha `canonical_slot` nova apareceu em
`processing_runs`. Chamando `operational-health` na sequência,
`scheduler_stalled` tinha sumido. Minutos depois, o **pg_cron disparou
sozinho no horário certo (16:00 UTC)** — confirmado por uma segunda linha em
`net._http_response`, sem eu ter feito nada. O backlog acumulado durante as
~19h de parada (`eventsAfterWindow` chegou a 134) já caiu para 1 na consulta
seguinte — se resolveu sozinho, como esperado.

## Estado real, com nível de evidência

| Item | Estado |
|---|---|
| Vigilância acusa agendador parado (PR #17) | **VALIDADO REMOTAMENTE** |
| Agendador migrado para pg_cron (D-024) | **VALIDADO REMOTAMENTE** — disparo manual e disparo automático (16:00 UTC) confirmados |
| Checagem de saúde redundante em pg_cron (D-024) | **VALIDADO REMOTAMENTE** — resposta 200 confirmada em `net._http_response` |
| Deploy automático de Edge Functions (D-025) | **IMPLEMENTADO**, sem push a `supabase/functions/**` ainda para exercitar de verdade |
| Causa raiz de por que o `schedule:` do GitHub Actions não dispara | **PENDENTE**, sem diagnóstico — contornado, não corrigido |
| Alerta chegando a uma pessoa (e-mail/Slack) quando algo quebra | **PENDENTE** — nenhum dos dois caminhos de checagem faz isso hoje; ambos exigem alguém consultar |
| 6.2, vocabulário com a equipe | mensagem pronta, **aguardando o Gabriel mandar** |
| 6.3, rotação de credencial do sensor | **PENDENTE**, propositalmente parado até a etapa 4 começar |
| Etapa 4 (sensor) | **PENDENTE** — plano existente incompleto, ver achado acima |
| Etapa 5 (Control Center) | **PENDENTE** — tecnicamente destravada desde a etapa 3, falta vocabulário (6.2) |
| Registry (herdado de 2026-09-04) | 8 grupos ativos, estável — sem regressão nesta sessão |

## Próxima ação exata (histórico — ver continuação abaixo, mais recente)

1. ~~Mandar a mensagem de vocabulário para a equipe (6.2)~~ — mensagem
   continua pronta em `mensagem-vocabulario-equipe.md` no scratchpad da
   sessão que a escreveu; **ainda não foi enviada**, é ação humana;
2. quando a equipe responder, ajustar o texto da tela e decidir ligar o
   Control Center (etapa 5);
3. ~~iniciar a etapa 4 (sensor) só quando houver decisão real sobre 6.3~~ —
   o Gabriel deu aval explícito para agir e criar nova build se necessário;
   ver "Continuação — 6.3/etapa 4 e alerta na UI" abaixo;
4. ~~considerar um canal de alerta ativo~~ — feito, ver abaixo: apareceu na
   UI em vez de e-mail/Slack, por decisão do Gabriel;
5. revisar e decidir o PR #16 (mesclar como documentação histórica, ou
   deixar como está) — ainda pendente.

## Não fazer sem decisão do Gabriel

Não ligar `group_control_center_enabled` sem a resposta da equipe sobre
vocabulário (6.2) — continua a única coisa nesta lista. A restrição sobre
`radar-sensor-probe` foi levantada pelo próprio Gabriel (ver abaixo).

---

# CONTINUAÇÃO — 6.3/etapa 4 e alerta na UI (mesmo dia, 2026-09-05)

## O que o Gabriel decidiu

Depois do resumo acima, o Gabriel respondeu diretamente às duas coisas em
aberto: **alerta pode aparecer na UI, não precisa ser e-mail**; e **pode
fazer o melhor possível em 6.3/etapa 4, inclusive criar nova build do APK
para o Moto G84 se necessário**. Isso removeu o bloqueio que a sessão
anterior tinha imposto a si mesma.

## Alerta na UI — IMPLEMENTADO e com dado conferido

`radar-read-model` agora calcula a mesma vigilância que o `pg_cron` chama
de dentro do banco (`private.radar_cron_health_check`), usando as mesmas
consultas mas pela sessão do próprio usuário (RLS, sem service role), e
devolve `operational_health: { healthy, problems }` no payload. O front-end
(`apps/radar-web/public/app.js`, `renderOperationalHealth`) mostra um
banner vermelho no topo da tela quando `healthy` é falso.

`evaluateOperationalHealth` foi promovida a módulo compartilhado
(`packages/supabase-core/src/edge-modules.js`, junto com
`consolidation-schedule.js`, do qual depende) — mesma engine, três lugares
que a chamam (script do GitHub Actions, `pg_cron`, e agora o read model),
igual ao padrão já usado para `group-analytics.js`.

**Nível de evidência:** os valores que alimentam o cálculo foram conferidos
com consulta SQL direta (bateram com o que `operational-health` já reportava
via `pg_cron`). A chamada HTTP completa com sessão de usuário real **não foi
testada** — não existe conta de teste neste projeto (mesma lacuna já
registrada em `docs/TEST_MATRIX.md` para outros fluxos). Rotule como
**IMPLEMENTADO e TESTADO COM DADO REAL VIA SQL**, não **VALIDADO REMOTAMENTE**
no sentido pleno.

## Etapa 4 — diagnóstico de shortcutId/LocusId, sem mudar identidade

Antes de reescrever a resolução de grupo sobre a suposição de que o
WhatsApp preenche `shortcutId`/`LocusId` (a única API do Android com
promessa de identidade estável por conversa), esta sessão fez o passo que
faltava: **medir**, em vez de assumir.

`radar-sensor-probe` v0.3.1-shortcut-diagnostic
([release](https://github.com/quentalgabriel-cloud/radar-sensor-probe/releases/tag/v0.3.1-shortcut-diagnostic))
captura os dois valores e propaga para `normalized_events.metadata` — campo
livre, sem mudança de contrato. **`conversation_id` continua vindo só do
hash do título.** Nada na resolução de grupo mudou.

Dois erros de compilação no caminho (`getShortcutId()` não existe em
`StatusBarNotification` nem em `Ranking` — o método real é
`Ranking.getConversationShortcutInfo()`, API 31, devolvendo um
`ShortcutInfo`) foram pegos pelo CI do próprio `radar-sensor-probe` antes de
qualquer release, e corrigidos confirmando a API certa por busca em vez de
tentar de novo às cegas.

**D-021 exercida**: a credencial do dispositivo foi rotacionada como parte
desta build (gatilho que a própria D-021 previa: "próxima build por
qualquer motivo"). Valor novo gerado localmente com `openssl rand -hex 32`,
nunca impresso; hash gravado em `device_credentials`; valor em claro só no
secret `RADAR_DEVICE_SECRET` do `radar-sensor-probe`. **A credencial antiga
(`token_hint 01e890c5`, id `23589a49-acdf-4f28-959e-67ab896b5bb1`) continua
ativa** — revogá-la é o próximo passo manual, só depois de confirmar que o
aparelho está rodando a build nova. D-021 em si (segredo embutido no APK,
não em provisionamento de runtime) **não foi resolvida**, só a rotação —
mudar a arquitetura é recorte maior, deliberadamente fora desta build.
Decisão completa em D-026, `docs/DECISIONS.md`.

## Limitação física que não deve ser esquecida

**Não existe forma remota de instalar o APK no Moto G84.** A build está
publicada, assinada e verificada — falta alguém com a mão no aparelho
baixar `radar-sensor-probe-v0.3.1-shortcut-diagnostic.apk` do release e
instalar manualmente, concedendo de novo o acesso a notificações se o
Android pedir. Nenhuma sessão futura deve prometer "atualizei o aparelho"
sem essa confirmação humana.

## Próxima ação exata (atual)

Estado em 2026-09-05, fim de sessão: **em espera humana, não bloqueado por
decisão técnica.**

1. Instalação do APK pedida ao Victor — **conferido no banco antes desta
   nota: o aparelho ainda estava com a build antiga** (`parser_version` do
   evento mais recente = `0.3.0`, zero eventos com `shortcut_id`/`locus_id`).
   Não confiar em "já pedi" como "já instalado" — reconferir com a mesma
   consulta antes de revogar a credencial antiga:
   ```sql
   select parser_version, metadata->>'shortcut_id', metadata->>'locus_id'
   from public.normalized_events
   where network_id='d1224e68-c51f-4b31-a7e6-7b91f1a65357'
   order by occurred_at desc limit 5;
   ```
   Só revogar `device_credentials` id `23589a49-acdf-4f28-959e-67ab896b5bb1`
   depois de ver `parser_version = '0.3.1'` num evento real;
2. mensagem de vocabulário (6.2) enviada à equipe — aguardando retorno;
3. os dois tokens pessoais do Supabase que passaram pelo chat desta sessão
   foram revogados pelo Gabriel — confirmado por ele, não verificável por
   consulta;
4. depois do item 1 confirmado e de alguns dias de dado real, consultar
   `shortcut_id`/`locus_id` em volume — se vierem preenchidos, a etapa 4 "de
   verdade" (mudança de identidade coordenada sensor+backend, achado do
   PR #16) pode ser desenhada com confiança; se vierem nulos, precisa de
   outra estratégia;
5. quando a equipe responder sobre vocabulário, decidir o Control Center
   (etapa 5);
6. revisar o PR #16 (plano de pesquisa, ainda não mesclado).

---

## Não reverta sem falar com o dono

A credencial do dispositivo está embutida em claro no APK público. **Risco aceito
por Gabriel Quental**, registrado como D-021 em `docs/DECISIONS.md`. Revogar a
credencial ou fechar o repositório do probe **pararia a captura em operação**.

---

# ENCERRAMENTO DA SESSÃƒO DE 2026-09-07 â€” LEIA ISTO PRIMEIRO

SessÃ£o de **frontend apenas**. Nada de backend mudou: nenhuma migration, nenhuma
RPC, nenhum contrato de ingestÃ£o, nenhuma Edge Function implantada. A flag
`group_control_center_enabled` da rede piloto continua `false`.

## 1. O que esta sessÃ£o entregou

O **Painel de Controle** (Control Center) saiu de dentro da tela "Grupos" e virou
tela prÃ³pria, com um app shell novo: sidebar de estado no desktop, gaveta no
celular, tabbar preservada como navegaÃ§Ã£o primÃ¡ria em telas estreitas.

DecisÃ£o completa e justificativa: **D-027 em `docs/DECISIONS.md`**.
VocabulÃ¡rio e regras de tela: **`docs/UX.md`**, seÃ§Ãµes "NavegaÃ§Ã£o atual" e
"Cobertura da captura na tela".

### Por que a tela foi calibrada assim

MediÃ§Ã£o feita contra produÃ§Ã£o em 2026-09-05 (projeto `pluruijhqnueayrlkthx`):

| Item | Valor medido |
|---|---:|
| eventos | 2.072 |
| grupos ativos | 8 (198 arquivados) |
| grupos **classificados** | **0** |
| grupos com atividade na janela | **1** (556 eventos) |
| situaÃ§Ãµes/alertas na janela | **0** |
| `capture_confidence` de todas as execuÃ§Ãµes recentes | **`low`** |
| `coverage_ratio` | 0,59â€“0,60 |
| `largest_gap_seconds` | 8.413 (2h20) |
| `configuration` | `unknown` |
| `trend_valid` | **false** |

ConsequÃªncia: hoje **100% dos grupos teriam `trend.direction = "unavailable"`**.
Uma tela organizada em torno de setas de crescimento estaria vazia. O que limita
a leitura Ã© a **cobertura da captura**, e ela existia no read model desde a P1.1
sem aparecer em nenhum lugar da UI. Por isso a tela responde, nesta ordem:
(1) o quanto dÃ¡ para confiar nesta janela, (2) quais grupos exigem decisÃ£o,
(3) quem Ã© cada grupo (classificaÃ§Ã£o â€” o trabalho real pendente: 0 de 8).

### MudanÃ§as, arquivo a arquivo

**Motor canÃ´nico â€” `packages/group-analytics/src/index.js`** (aditivo)
- `CONTROL_CENTER_SCHEMA_VERSION`: `0.2.0` â†’ **`0.3.0`**.
- `trends: { event_count, situation_count, demand_count }` por grupo, ao lado do
  `trend` existente (que continua sendo o de atividade, intocado). Mesmo
  `computeMetricTrend`, mesma polÃ­tica, mesma exigÃªncia de cobertura.
- `anchor.window_kind` passa a existir (vinha sÃ³ de `freshness`, que nÃ£o existe
  no laboratÃ³rio).
- `summary` ganha `inactive`, `growing`, `stable`.
- **CorreÃ§Ã£o de significado:** a sÃ©rie do `sparkline` agora sÃ³ inclui execuÃ§Ãµes
  do **mesmo `window_kind` e duraÃ§Ã£o equivalente**. Antes misturava
  `manual_refresh` e `legacy_on_read` com slots agendados e desenhava uma linha
  entre janelas que o prÃ³prio motor recusa comparar.
- CÃ³pia Edge regenerada por `pnpm --filter @radar-rede/supabase-core sync:edge`.

**LaboratÃ³rio â€” `packages/radar-view-model/src/index.js`**
- `buildSyntheticControlCenter` passa `enabled: true`. Motivo: validar
  vocabulÃ¡rio com a coordenaÃ§Ã£o Ã© gate pendente e nÃ£o pode depender de ligar a
  flag em produÃ§Ã£o. **NÃ£o fabrica comparaÃ§Ã£o:** o cenÃ¡rio tem uma janela sÃ³, entÃ£o
  tendÃªncia e cobertura aparecem indisponÃ­veis â€” a mesma forma da rede real hoje.

**Web â€” `apps/radar-web/public/{index.html,styles.css,app.js}`**
- App shell: `.app-shell` + sidebar (`#sidebar`) + `.app-main`.
- Sidebar com estado vivo, badges por seÃ§Ã£o, resumo da janela, e os seletores de
  ambiente/cenÃ¡rio (que saÃ­ram do topo do conteÃºdo). RecolhÃ­vel em â‰¥1024px, com
  preferÃªncia em `localStorage`; gaveta em <1024px com ESC, clique fora e
  `inert` quando fechada.
- Tela nova `data-screen="control"`; a tabbar foi para cinco colunas.
- Ã‚ncora: janela + tipo + comparadora/motivo + **medidor de cobertura**
  (nÃ­vel e motivo como texto principal, percentagem como apoio, estado explÃ­cito
  de "nÃ£o medida" distinto de zero, teto sÃ³ quando o motor o emite).
- Cinco nÃºmeros do resumo viraram **chips clicÃ¡veis**; seis presets substituem a
  parede de `<select>`, que foi para "Filtros avanÃ§ados" recolhÃ­veis (mesmos ids).
- CartÃ£o: trilha de condiÃ§Ã£o em gradiente **com rÃ³tulo textual**, sparkline SVG
  com `<title>`, chip de tendÃªncia ou motivo, chip de classificaÃ§Ã£o.
- Painel de detalhe (`<dialog>` Ãºnico, com rolagem prÃ³pria) aberto pelo Painel de
  controle **e** pela tela Grupos: leitura atual, tendÃªncias por parÃ¢metro, ritmo,
  assuntos, confianÃ§a, **classificaÃ§Ã£o** (formulÃ¡rio + aliases + histÃ³rico) e
  evidÃªncia.
- Tela Captura passa a usar `health.evaluation` (camadas aparelho/captura/
  sincronizaÃ§Ã£o + prÃ³xima aÃ§Ã£o), que o read model jÃ¡ produzia e a UI ignorava.

**CorreÃ§Ãµes de defeito encontradas no caminho**
- `[hidden] { display: none !important; }`: a regra de autor vencia a do agente,
  entÃ£o `.tabbar`, `.group-list` e `.demo-selector` **nÃ£o eram escondidos** por
  `element.hidden = true`. Bug prÃ©-existente.
- `aria-live` removido da Ã¢ncora: ela era reanunciada a cada tecla da busca.
- `prefers-reduced-motion` passa a zerar `transition`, nÃ£o sÃ³ `animation`.
- Alvos de toque de chips e botÃµes de alias para 44px.
- Badge de situaÃ§Ãµes nÃ£o renderiza mais um "0" vermelho permanente.
- OrdenaÃ§Ã£o padrÃ£o desempata por atividade (sem alertas, tudo empatava em
  "normal" e o grupo com 556 eventos podia nÃ£o aparecer no topo).
- Foco volta ao cartÃ£o que abriu o painel, ao fechar.

## 2. VerificaÃ§Ã£o realmente executada

- `pnpm -r check` â€” OK (12 pacotes).
- `pnpm -r test` â€” **162 testes, 0 falhas** (eram 156).
- `pnpm -r build` â€” OK.
- `pnpm --filter @radar-rede/radar-web test:e2e` â€” **20/20 verdes**, Chromium
  real, incluindo casos novos: sidebar/tabbar, gaveta no celular com ESC e sem
  rolagem lateral, presets, cobertura com nÃ­vel/motivo/consequÃªncia, cobertura
  "nÃ£o medida" â‰  zero, e um Ãºnico `aria-current` na pÃ¡gina.

Isso prova implementaÃ§Ã£o e teste local. **NÃ£o prova nada remoto:** nada foi
implantado nesta sessÃ£o.

## 3. Estado dos gates

| Gate | Estado |
|---|---|
| Etapas 1â€“3 do registry (estancar, guardrail, consolidar) | VALIDADO REMOTAMENTE (2026-09-04, sem regressÃ£o) |
| Etapa 4 (sensor: canonicalizar na origem, `shortcutId`, config no heartbeat) | **PENDENTE** â€” repositÃ³rio `quentalgabriel-cloud/radar-sensor-probe` |
| Gate 2 (duas janelas comparÃ¡veis com tendÃªncia real) | **NÃƒO ATINGIDO** â€” bloqueado por cobertura, nÃ£o por comparadora |
| Etapa 5 (ligar Control Center) | **PENDENTE** â€” a tela estÃ¡ pronta; falta validar vocabulÃ¡rio e decidir |
| VocabulÃ¡rio validado com a coordenaÃ§Ã£o | **PENDENTE** â€” agora possÃ­vel pelo laboratÃ³rio |
| E2E de navegador (entrega 6 da P1.1) | **FEITO** nesta sessÃ£o |

## 4. PrÃ³xima aÃ§Ã£o exata, em ordem

1. **Mostrar o laboratÃ³rio para a coordenaÃ§Ã£o** (`?mode=lab`, aba "Painel de
   controle") e colher objeÃ§Ãµes de vocabulÃ¡rio. Ã‰ o gate declarado como pendente
   e o mais barato de fechar.
2. **Decidir o scheduler** â€” `pg_cron` vs. GitHub Actions. PR
   [#10](https://github.com/quentalgabriel-cloud/radar-da-rede/pull/10) traz o
   diagnÃ³stico: o cron entregou 2 de 6 slots em pelo menos um dia observado.
3. **Atacar a cobertura**, que Ã© o que hoje desliga toda a tendÃªncia. Duas
   frentes, ambas no `radar-sensor-probe` (etapa 4):
   - reportar `notification_access`, `whatsapp_installed` e `network_type` â€”
     sem isso o teto Ã© `moderate` por construÃ§Ã£o (ver D-022);
   - reduzir os vÃ£os de heartbeat (`largest_gap_seconds` de 2h20 derruba a
     cobertura para ~60%).
   Antes de mexer em tolerÃ¢ncia, reler D-022: ela foi calibrada com mediÃ§Ã£o e
   **nÃ£o** deve ser afrouxada para melhorar a mÃ©trica.
4. **Implantar `radar-read-model`** para que `trends` e `anchor.window_kind`
   cheguem Ã  produÃ§Ã£o:
   `supabase functions deploy radar-read-model --project-ref pluruijhqnueayrlkthx`.
   NÃ£o Ã© urgente: a UI funciona sem os campos novos.
5. **Ligar o Control Center** para a rede piloto, quando 1 estiver fechado:
   ```sql
   update public.networks set group_control_center_enabled = true
   where id = 'd1224e68-c51f-4b31-a7e6-7b91f1a65357';
   ```
   Desligar Ã© o mesmo com `false` â€” rollback imediato, sem deploy.
6. Revisar os PRs [#5](https://github.com/quentalgabriel-cloud/radar-da-rede/pull/5)
   e [#10](https://github.com/quentalgabriel-cloud/radar-da-rede/pull/10),
   abertos de sessÃµes anteriores.

## 5. Rollback desta entrega

Por camada, do mais barato ao mais caro:

- **UI inteira:** reverter o commit desta sessÃ£o. NÃ£o hÃ¡ estado persistido novo;
  a Ãºnica preferÃªncia gravada Ã© `radar.sidebar.collapsed` em `localStorage`.
- **Painel na produÃ§Ã£o:** `group_control_center_enabled = false` (jÃ¡ Ã© o estado).
- **LaboratÃ³rio:** voltar `enabled: false` em `buildSyntheticControlCenter`
  (`packages/radar-view-model/src/index.js`) e as asserÃ§Ãµes correspondentes em
  `apps/radar-web/test/web.test.js` e `packages/radar-view-model/test/view-model.test.js`.
- **`trends` / `window_kind`:** sÃ£o aditivos. NÃ£o implantar `radar-read-model` jÃ¡
  Ã© o rollback; a UI degrada sozinha quando os campos faltam.
- **`sparkline` filtrado:** reverter o filtro em `buildGroupControlCenter` volta
  ao comportamento antigo â€” mas ele desenhava tendÃªncia entre janelas nÃ£o
  comparÃ¡veis; reverter exige justificativa.

## 6. DÃ­vidas conhecidas que esta sessÃ£o NÃƒO fechou

1. **Cobertura da captura em ~60%** â€” a causa Ã© o sensor, nÃ£o a UI. Ã‰ o bloqueio
   real da tendÃªncia.
2. **`recent_events` nÃ£o carrega `group_id`.** A evidÃªncia do painel de detalhe
   casa por **rÃ³tulo** do grupo. A tela declara isso em texto, mas o vÃ­nculo
   correto exigiria o read model emitir o `group_id` jÃ¡ resolvido (o vÃ­nculo
   existe em `buildEventGroupLinks`, `supabase/functions/_shared/group-metrics.js`).
3. **`groups[].last_seen_at` nÃ£o Ã© da janela** â€” vem da tabela `groups`. A tela
   rotula como "visto pela Ãºltima vez" em vez de "Ãºltima atividade no perÃ­odo".
4. **198 grupos arquivados** nÃ£o tÃªm caminho de navegaÃ§Ã£o; sÃ³ aparecem como
   contagem no resumo da tela Grupos.
5. **`group_registry_summary` conta todos os status**, enquanto o Control Center
   conta sÃ³ ativos. A tela usa a contagem de ativos para o badge; a divergÃªncia
   das duas fontes continua nÃ£o resolvida no backend.
6. **CondiÃ§Ã£o Ã© quase sempre "normal"** porque depende de alertas na janela, e
   houve zero. O gradiente crÃ­ticoâ†’ideal estÃ¡ implementado mas nÃ£o discrimina
   nada hoje.
7. **Sem paginaÃ§Ã£o no read model** (D15): `GROUP_LIMIT = 500`. Com 206 grupos jÃ¡
   funciona; em 300+ grupos ativos precisarÃ¡ de cursor.

## 7. Contrato de trabalho para quem continuar

`AGENTS.md` vale integralmente. Em especial, para esta Ã¡rea:

- crescimento nÃ£o Ã© resultado positivo;
- cor nunca Ã© o Ãºnico significado;
- nÃ£o apresentar tendÃªncia sem janelas comparÃ¡veis, nem confianÃ§a sem cobertura
  observada;
- nÃ£o converter cobertura ausente em zero;
- P2 (menÃ§Ãµes polÃ­ticas, "dobradinhas", sentimento, linguagem natural) **nÃ£o
  comeÃ§ou e nÃ£o deve comeÃ§ar** enquanto a P1.1 nÃ£o fechar;
- ao mudar texto de tela coberto por E2E, **reescrever a asserÃ§Ã£o para o texto
  novo** â€” nunca apagÃ¡-la nem trocÃ¡-la por `assert.ok(length > 0)`.

Armadilhas de teste que custaram tempo nesta sessÃ£o, para nÃ£o se repetirem:

- `waitForSelector` espera **visibilidade** por padrÃ£o. `#loading-state[hidden]`
  e `#group-drawer:not([open])` nunca ficam visÃ­veis â€” use `{ state: "hidden" }`
  ou `waitForFunction`.
- a tabbar **some** em â‰¥1024px; ela nÃ£o serve mais como sinal de "carregou".
  Use `#radar-content:not([hidden])`.
- a sidebar fechada continua "visÃ­vel" para o Playwright (estÃ¡ apenas
  transladada). Escolha o controle pela visibilidade da **tabbar**.
- `innerText` aplica `text-transform`; para conferir rÃ³tulo ou identificador use
  `textContent`.

---

# RETOMADA DE 2026-09-07 — RECONCILIAÇÃO DO PR #24 E ESTADO REMOTO

## Diagnóstico confirmado

- O PR #24 estava em conflito com `main` porque as sessões de 2026-09-05
  entregaram o scheduler em `pg_cron`, a vigilância no read model/UI, o deploy
  automático de Edge Functions e o diagnóstico do sensor depois de a branch do
  Painel de Controle ter sido aberta.
- A decisão do Painel foi renumerada de D-024 para **D-027**; D-024 já pertence
  ao scheduler e não pode ter dois significados.
- Produção web ainda serve a interface anterior. O preview do PR existe, mas é
  protegido pela Vercel e exige aprovação do owner para acesso.
- O modo live da produção foi aberto no Chrome, mas não havia sessão autenticada;
  portanto a tela nova continua **NÃO VALIDADA COM SESSÃO REAL**.

## Menor entrega completa desta retomada

A condição de saída da rotação descrita em D-026 foi atingida: os eventos mais
recentes chegaram com `parser_version = 0.3.1` e `shortcut_id` preenchido. A
credencial antiga `23589a49-acdf-4f28-959e-67ab896b5bb1` (`token_hint
01e890c5`) foi revogada em 2026-09-07 16:14:46 UTC. Consulta separada confirmou
**1 credencial ativa e 1 revogada** para a rede, com evento 0.3.1 recente. O
rollback é restaurar `revoked_at = null` apenas nesse ID.

## Evidência remota desta retomada

| Item | Valor em 2026-09-07 |
|---|---:|
| eventos | 2.657 |
| batches | 418 |
| grupos ativos | 11 |
| grupos arquivados | 198 |
| grupos com classificação confirmada | 0 |
| amostras de saúde | 546 |
| `group_control_center_enabled` | `false` |
| cobertura das 12 execuções recentes | 0,33–0,63, sempre `low` |
| maior vão observado nessas execuções | 16.619 s (4h37) |

Os três grupos acima dos 8 registrados no handoff anterior nasceram em
2026-09-07 com rótulos distintos; isso é crescimento legítimo do escopo
observado, não a inflação anterior por várias notificações da mesma conversa.
Os jobs `radar-consolidate` e `radar-health-check` estão ativos no `pg_cron`.

## Verificação local

- `pnpm -r --if-present check`: OK.
- `pnpm -r --if-present test`: 166 testes, 0 falhas.
- `pnpm -r --if-present build`: OK.
- `pnpm --filter @radar-rede/radar-web test:e2e`: 20/20 com Chromium real.

Depois de reconciliar `main`, repetir essa verificação antes de concluir o
merge commit e conferir no preview que o banner de vigilância e o novo shell
coexistem.

## Próxima ação exata

1. Publicar o merge de reconciliação na branch do PR #24 e aguardar o novo
   preview da Vercel.
2. O owner libera o preview para a coordenação; colher resposta explícita sobre
   “condição”, “tendência”, “cobertura”, “janela”, “comparação” e “sem atividade”.
3. Abrir `?mode=live` com sessão real no preview e conferir os 11 grupos, a
   cobertura baixa e o banner de vigilância antes de mesclar o PR.
4. Só depois da validação humana decidir a flag do Control Center. Não ligar por
   inferência.

---

# GO-LIVE DE 2026-09-07 — `MAIN` E REDE PILOTO ATIVAS

## Resultado

- O PR #24 foi mesclado na `main` pelo commit
  `5dbeb073d01e325039460d375589fb37264af66a` e publicado em produção.
- O workflow CI da `main` terminou com sucesso: run
  [#79](https://github.com/quentalgabriel-cloud/radar-da-rede/actions/runs/34143006058).
- O deploy das Edge Functions terminou com sucesso: run
  [#6](https://github.com/quentalgabriel-cloud/radar-da-rede/actions/runs/34143006190).
- A produção web em `https://radar-da-rede.vercel.app` serve o novo shell e o
  Painel de Controle. O smoke no modo demonstração confirmou as cinco seções,
  filtros, cobertura e detalhe de grupo.
- `group_control_center_enabled` está `true` exclusivamente para a rede piloto
  `d1224e68-c51f-4b31-a7e6-7b91f1a65357`; uma segunda consulta confirmou o
  valor depois do `update`.

## Gate remoto imediatamente antes da ativação

| Item | Resultado |
|---|---:|
| janela canônica mais recente | `2026-09-06 16:00Z` a `2026-09-07 16:00Z` |
| eventos de entrada | 330 |
| grupos ativos | 11 |
| linhas de métricas por grupo | 11 |
| cobertura | 0,6304 — `low` |
| tendência | inválida, como esperado com cobertura baixa |
| jobs `radar-consolidate` / `radar-health-check` | ativos |
| três respostas mais recentes do `pg_net` | HTTP 200, sem timeout |

A ativação não transforma baixa cobertura em confiança: a UI continua
mostrando a limitação e não apresenta tendência enganosa.

## Segurança e validação que permanecem explícitas

- A rota live publicada exige autenticação, e uma chamada direta ao
  `radar-read-model` apenas com a chave publicável recebeu HTTP 401
  `INVALID_CREDENTIALS`.
- Não havia sessão real no navegador usado no go-live. Assim, o fluxo visual
  autenticado com dados reais ainda precisa de um smoke manual por um usuário
  autorizado; backend, contrato, build, E2E e proteção sem token estão
  validados.
- Os advisors do Supabase não apontaram erro crítico. Os avisos sobre
  `device_credentials` e `processing_credentials` sem policy são o deny-by-
  default intencional; os RPCs `SECURITY DEFINER` sinalizados validam
  `auth.uid()`, associação à rede e, nas mutações, papel operator/owner.
- Hardening posterior: habilitar proteção contra senhas vazadas no Supabase
  Auth e avaliar a migração da extensão `pg_net` para outro schema sem quebrar
  os jobs. Não misturar essas mudanças com o rollback do painel.

## Rollback imediato

O primeiro rollback é somente a flag, sem deploy:

```sql
update public.networks
set group_control_center_enabled = false
where id = 'd1224e68-c51f-4b31-a7e6-7b91f1a65357';
```

Se houver defeito de código, abrir um PR que reverta o merge `5dbeb073`; não
usar `reset --hard` na `main`. A baixa cobertura, isoladamente, não exige
rollback porque é apresentada de forma explícita e invalida as tendências.
