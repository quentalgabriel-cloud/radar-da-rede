# Handoff para continuidade por qualquer LLM

- Atualizado em: 2026-09-03, fim da sessão (P1.1, parte 1)
- **Comece pela seção final, "ENCERRAMENTO DA SESSÃO"** — ela reordena a prioridade por causa do uso da equipe em 2026-09-04
- Branch: `main`
- Base auditada: commit `86c66fb`
- Trabalho desta sessão: PR [#1](https://github.com/quentalgabriel-cloud/radar-da-rede/pull/1), commits `838fb81`..`b65cdb1`, mesclado em `main` pelo merge `8e90141` em 2026-09-03
- Projeto Supabase: `pluruijhqnueayrlkthx`
- Rede piloto: `d1224e68-c51f-4b31-a7e6-7b91f1a65357`
- Produção web: `https://radar-da-rede.vercel.app`

## Estado executivo

A fase corrente continua sendo **P1.1**. Não avance para P2.

A consolidação voltou a produzir janela real: existe credencial ativa, uma
execução canônica remota e replay idempotente comprovado. As três correções
analíticas centrais (âncora de execução, política de comparação e cobertura de
captura), a separação entre leitura e processamento, a paridade synthetic/live e
a correção de vocabulário estão **implementadas e testadas localmente**.

Elas **ainda não valem em produção**, porque as Edge Functions implantadas
continuam sendo as antigas. O Control Center permanece desligado
(`group_control_center_enabled = false`).

Relatório completo desta sessão: `docs/P1.1-EXECUTION-REPORT.md`.

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

# ENCERRAMENTO DA SESSÃO DE 2026-09-03 — LEIA ISTO PRIMEIRO

## Contexto que muda a prioridade

A equipe começa a usar o sistema em 2026-09-04 (sexta) e trabalha **o dia todo,
inclusive fim de semana**. Isso reordena o que importa: antes de qualquer gate,
resolva os dois itens de OPERAÇÃO abaixo. Eles são regressões introduzidas pela
própria P1.1 e ainda não corrigidas.

## URGENTE 1 — a equipe perdeu o botão de atualizar

Antes da P1.1, **toda abertura da página reconsolidava**, porque o GET do read
model processava. Isso foi removido, corretamente. Mas a UI **não** foi ligada ao
substituto.

`process-latest-window` já existe, já está implantada em v7, já exige papel
operator/owner e já tem limite de cinco minutos. Falta apenas o front chamá-la.

- `apps/radar-web/public/supabase-provider.js` tem `readModel(networkId)`; falta
  um `refreshLatestWindow(networkId)` que faça `POST /functions/v1/process-latest-window?network_id=…`
  com o token do usuário;
- `apps/radar-web/public/refresh-controller.js` tem `refresh(reason)`; o botão
  manual deve, para operator/owner, chamar a consolidação antes de reler;
- tratar `429 rate_limited` mostrando `retry_after_seconds`, e `403
  manual_refresh_not_authorized` escondendo a ação para quem é viewer.

Sem isso, no sábado a equipe vê dado de até cinco horas atrás sem poder forçar
atualização.

## URGENTE 2 — só três consolidações por dia, com 14 horas de vão

Hoje: `0 11,16,21 * * *` UTC, ou seja 08:00, 13:00 e 18:00 de Recife. Entre
18:00 e 08:00 não há consolidação nenhuma.

Mudança recomendada em `.github/workflows/consolidate.yml`:

```yaml
- cron: "0 0,3,6,11,16,21 * * *"
```

Seis slots por dia, vão máximo de cinco horas, e **preserva os três horários
atuais**. Isso importa: a política `same_slot_previous_day@1` compara cada slot
com ele mesmo no dia anterior, então trocar os horários existentes órfãos as
execuções já produzidas e adiaria ainda mais a primeira tendência.

`packages/supabase-core/src/consolidation-schedule.js` tem
`CONSOLIDATION_LOCAL_HOURS = [8, 13, 18]` e precisa mudar junto, senão a janela
canônica calculada não bate com o horário do cron. Há teste cobrindo isso.

## Estado real, com nível de evidência

| Gate | Estado |
|---|---|
| 1. scheduler executa e falha visivelmente | **VALIDADO REMOTAMENTE**, nos dois caminhos |
| 2. duas janelas comparáveis | **mecanismo fechado**; tendência só a partir de ~05/09 |
| 3. zeros presos à execução atual | **VALIDADO REMOTAMENTE**: 152 de 152 grupos |
| 4. confidence mede cobertura | **VALIDADO REMOTAMENTE**: `capture_coverage@1` |
| 5. read model somente leitura | **VALIDADO REMOTAMENTE**, conferido byte a byte |
| 6. paridade, E2E, campo | paridade feita; **E2E e campo pendentes** |
| 7. vocabulário com a coordenação | pendente — o uso de sexta é o insumo |
| 8. rollback | cadeia de RPC testada localmente; remoto pendente |

Implantado: `process-window` v6, `process-latest-window` v7, `radar-read-model`
v13. Migrations aplicadas: 12. `main` em `3fb0300`; o PR #5 traz a documentação
desta sessão e ainda não foi mesclado.

## Por que a tendência não pode aparecer antes de ~05/09

A regra exige confiança `moderate` ou `high` nas **duas** janelas. A série
append-only de amostras começou em 2026-09-03 19:52 UTC, então toda janela que
termina antes disso é `unavailable` por `no_capture_samples`.

**Alternativa investigada e descartada, com número.** Tentei usar
`ingest_batches.sent_at` como prova adicional de vivacidade, já que é append-only
e existe desde 27/08. Não funciona: os lotes só chegam quando há mensagem.

| Janela | Lotes | Maior intervalo |
|---|---:|---:|
| atual `02T21→03T21` | 32 | 9h29 |
| comparadora `01T21→02T21` | 10 | 16h22 |

As madrugadas ficam sem evidência nenhuma. Não temos como provar que a captura
esteve viva nesses períodos. **Não force esse caminho** — inflar cobertura para
liberar a tendência seria mascarar exatamente a falha que a P1.1 existe para
tornar visível.

Caminho legítimo para o futuro: o aparelho já rastreia `listener_connected_at` e
declara conexão contínua desde 2026-08-29. Se uma próxima build do sensor passar
esse campo no heartbeat, a cobertura pode usá-lo como evidência forte de
continuidade. Isso é trabalho no repositório do probe.

## Primeira verificação da manhã, antes de tudo

Medir a cadência noturna. Às 22:01 UTC o intervalo desde a última amostra era de
**33,2 minutos**, contra 3,6 de média diurna, e o limite de `capture_coverage@1`
é 35. A consulta por hora está na seção 12 de `docs/P1.1-EXECUTION-REPORT.md`.

Se algum intervalo noturno passar de 35 minutos, decida entre ajustar a
tolerância **com justificativa medida** ou tratar a lacuna como perda real de
cobertura. Não mexa no limite só para a métrica melhorar.

## Sobre ligar o Control Center na sexta

Não foi ligado nesta sessão; `group_control_center_enabled` continua `false`.

A recomendação é ligar em **modo reduzido** para a rede piloto, porque o valor
não está só na tendência. Com dado real ancorado na execução atual, a tela já
entrega: quais dos 152 grupos estão ativos ou silenciosos na janela, condição,
situações no período, contexto, filtros, ordenação, busca, sparkline sobre as
quatro execuções canônicas reais e confiança da captura com motivo textual. A
coluna de tendência diz honestamente por que não há comparação, e em ~05/09 as
tendências acendem sozinhas, sem novo deploy.

Antes de ligar, feche os dois urgentes acima e rode o E2E. Ligar é
`update public.networks set group_control_center_enabled = true where id = 'd1224e68-c51f-4b31-a7e6-7b91f1a65357';`
e desligar é o mesmo com `false` — rollback imediato, sem deploy.

## Ordem sugerida para a próxima sessão (atualizada em 2026-09-04)

1. ~~medir a cadência noturna~~ — feito, resultado abaixo;
2. ~~URGENTE 1, botão de atualizar~~ — feito no PR #6;
3. ~~URGENTE 2, seis slots por dia~~ — feito no PR #6;
4. ~~SLO e alertas (D06)~~ — feito no PR #6; falta **implantar a Edge Function
   `operational-health`**, senão o workflow novo falha de forma visível;
5. decidir a tolerância de cobertura, com a medição já disponível;
6. ~~E2E de navegador (gate 6)~~ — feito no PR #6: oito testes em Chromium
   real, verificados por mutação, com job próprio no CI;
7. **NÃO ligar o Control Center** até a identidade de grupo ser resolvida — ver
   `docs/GROUP-IDENTITY-FINDING.md`. Os gates analíticos estão fechados; o que
   bloqueia é o registry, com 196 grupos para 1 conversa real;
8. em 05/09, conferir a primeira tendência real e fechar o gate 2.

O prompt da etapa está em `docs/implementation-prompts/P1.1-FECHAMENTO.md`.

### Resultado da medição noturna

| Evidência | Valor |
|---|---:|
| intervalo médio diurno | 3,6 min |
| maior intervalo diurno | 16,7 min |
| maior intervalo noturno | **41,4 min** |
| eficiência do bridging a 35 min | **~79,5%** |

Dois intervalos passaram dos 35 minutos de tolerância. A cobertura estaciona
perto de 80%, então o nível `high`, que exige 90%, fica inalcançável enquanto o
sensor depender de `PeriodicWorkRequest`.

A causa não é perda de captura: o diagnóstico do aparelho mostra listener
conectado sem interrupção desde 29/08 e os eventos continuaram chegando. São
adiamentos do WorkManager pelo Doze.

**A tolerância não foi alterada.** A decisão está descrita no prompt da etapa,
com as duas opções. Se escolher calibrar, o número precisa vir do percentil
observado e a regra precisa virar `capture_coverage@2`, para que as execuções
antigas continuem interpretáveis. Não mexa no limite só para destravar a
tendência.

## Por que o Control Center continua desligado

Não é gate analítico em aberto. Os gates 1, 3, 4 e 5 estão validados em produção
e o 6 tem E2E cobrindo a própria tela do Control Center.

O bloqueio é a identidade de conversa. O sensor emite `source_conversation_id`
diferente a cada notificação, então o registry criou **199 grupos para uma única
conversa real**. A tela mostraria cerca de 196 linhas para o que é uma conversa
só — afirmaria algo falso sobre a rede.

A vista v0.1 que a equipe usa hoje **está correta**: o read model canonicaliza
antes de montar as conversas. A duplicação afeta só o registry.

Causa raiz **provada**: o sensor deriva a identidade do título, mas o WhatsApp
inclui a contagem acumulada nele — `(258 mensagens)`, `(259 mensagens)` — então
cada notificação gera um hash novo. Recalcular a derivação reproduz 204 de 204
ids do banco, sem divergência.

A normalização que resolve **já existe** neste repositório
(`canonicalConversationLabel`) e já é confiada para exibir; falta aplicá-la no
caminho de resolução de grupo.

**Etapa 1 concluída e validada remotamente em 2026-09-04**: a resolução de grupo
passou a canonicalizar antes de resolver, e o crescimento parou — uma janela com
duas conversas reais criou dois grupos, e a execução seguinte criou zero. Os 201
grupos voláteis antigos seguem inertes até a etapa 3.

**Atenção, achado novo:** o cron do GitHub entregou 2 de 5 slots esperados em
2026-09-04, com atraso de horas. A vigilância não pega isso, porque mede atraso
contra seis horas e não slots entregues versus esperados. Detalhe no plano.

Plano completo em `docs/GROUP-IDENTITY-PLAN.md` e prompt de execução em
`docs/implementation-prompts/P1.2-IDENTIDADE-DE-CONVERSA.md`.
A primeira etapa não exige tocar no aparelho. Medições em `docs/GROUP-IDENTITY-FINDING.md`.

## Não reverta sem falar com o dono

A credencial do dispositivo está embutida em claro no APK público. **Risco aceito
por Gabriel Quental**, registrado como D-021 em `docs/DECISIONS.md`. Revogar a
credencial ou fechar o repositório do probe **pararia a captura em operação**.
