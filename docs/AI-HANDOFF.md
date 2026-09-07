# Handoff para continuidade por qualquer LLM

> **LEIA PRIMEIRO: "ENCERRAMENTO DA SESSÃO DE 2026-09-07", no fim deste arquivo.**
> É a seção corrente. A de 2026-09-04 continua válida para backend e registry;
> o corpo mais antigo tem premissas superadas.

- Atualizado em: 2026-09-04, fim da sessão (P1.1, etapas 1–3 do registry de grupos)
- **Comece pela seção final** — o corpo do documento acima ainda descreve estado pré-consolidação em vários pontos; a seção final tem a versão corrente
- Branch: `main`, no commit `b93a879`
- Trabalho desta sessão: PRs [#11](https://github.com/quentalgabriel-cloud/radar-da-rede/pull/11), [#12](https://github.com/quentalgabriel-cloud/radar-da-rede/pull/12) e [#13](https://github.com/quentalgabriel-cloud/radar-da-rede/pull/13), mesclados em `main`
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

DecisÃ£o completa e justificativa: **D-024 em `docs/DECISIONS.md`**.
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
