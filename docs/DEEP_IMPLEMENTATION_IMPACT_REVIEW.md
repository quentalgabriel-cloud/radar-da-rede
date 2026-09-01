# Deep Implementation Impact Review — Radar da Rede

**Data:** 2026-08-31  
**Base auditada:** `main` até `6f3a9a9`  
**Natureza:** plano técnico e de produto; nenhuma recomendação abaixo deve ser tratada como funcionalidade já implementada.

## 1. Executive Summary

A nova visão é compatível com a arquitetura existente. O fluxo `Source Adapter -> NormalizedEvent -> Core -> Intelligence -> Radar Web`, a ingestão idempotente, o outbox Android, o processamento por janela, a proveniência e os providers reversíveis devem permanecer. A mudança estrutural necessária está entre eventos e leitura analítica: hoje “grupo” é apenas uma conversa agregada pelo `conversation_id`, e no caminho persistido esse ID é recanonizado pelo rótulo observado. Isso não sustenta renomeações, nomes duplicados, classificação manual nem governança legacy/managed.

A menor evolução segura é uma arquitetura híbrida:

1. preservar `normalized_events` e seu `conversation_id` como evidência imutável da fonte;
2. criar `groups` e `group_aliases` no Core;
3. resolver cada identidade observada para `group_id` durante o processamento, não no Android;
4. começar com resolução automática somente para correspondências inequívocas e encaminhar ambiguidades para confirmação humana;
5. persistir métricas por grupo e janela em `group_metric_windows` no mesmo processamento transacional;
6. evoluir `conversations` para `groups` no read model v0.2, mantendo um alias temporário de compatibilidade;
7. lançar o Control Center de Grupos atrás de feature flag;
8. calcular tendência por período atual versus anterior e invalidá-la quando a captura não for confiável.

Não se recomenda alterar o contrato `NormalizedEvent` v0.1.0, nem migrar eventos antigos para substituir `conversation_id`. Também não se recomenda agora: contexto muitos-para-muitos, ontologia territorial, RAG, embeddings, score único de grupo, CRM ou perfilamento. Menções políticas, reação/sentimento agregado e segmentação por grupo/contexto estão desbloqueados, mas devem ser módulos identificáveis, mensuráveis e reversíveis, sem inferir intenção de voto ou perfil individual.

## 2. Estado atual do sistema

### Arquitetura e contratos

O contrato canônico é JSON Schema 2020-12. `NormalizedEvent` v0.1.0 contém identidade de rede/dispositivo, fonte, `conversation_id`, `conversation_label`, tempos de ocorrência/captura, tipo/texto, `sender_ref`, parser e metadata. `IngestBatch` e `HealthHeartbeat` são contratos separados. O Core recebe ao menos uma vez e deduplica por `batch_id` e `event_id`.

### Android

O `NotificationListenerService` aceita WhatsApp e WhatsApp Business, extrai `MessagingStyle.Message`, exige evidência explícita de grupo e persiste antes do envio. O parser:

- escolhe o rótulo entre título e subtítulo;
- deriva `conversation_id` como `wa_` + SHA-256 truncado do rótulo;
- deriva `sender_ref` por hash do nome observado;
- gera IDs determinísticos por conversa, horário, remetente e texto;
- envia metadata técnica de notificação, índice e evidência;
- usa Room como outbox, WorkManager para retry e heartbeat remoto.

Consequência: renomear um grupo muda a identidade calculada. Dois grupos com o mesmo rótulo podem colidir semanticamente. O Android não observa um identificador estável de grupo no payload atualmente usado.

### Supabase/Core

Existem 14 estruturas persistentes relevantes:

| Estrutura | Responsabilidade |
|---|---|
| `networks`, `network_members` | tenancy, papéis e RLS |
| `source_devices`, `device_credentials` | fontes e autenticação de dispositivo |
| `processing_credentials` | autenticação escopada do processador |
| `ingest_batches`, `normalized_events` | ingestão idempotente e eventos imutáveis |
| `adapter_health` | último heartbeat e diagnóstico corrente |
| `capture_health_transitions` | mudanças relevantes da captura |
| `diagnostic_tests` | evidência histórica do teste local; RPCs administrativas foram removidas no hardening |
| `processing_runs` | janela, versão e hash da entrada |
| `facts`, `signals`, `alerts` | derivados com proveniência |

Não existem `groups`, `group_aliases`, `communities`, `group_metric_windows`, `tracked_entities` ou uma fila de classificação. `metadata.territory` é a única dimensão contextual usada hoje.

### Intelligence

A taxonomia determinística v0.1.0 classifica texto em `material_logistica`, `agenda_mobilizacao`, `duvida_orientacao`, `demanda_territorial`, `problema_operacional` e `alegacao_verificar`. Produz facts agregados por categoria, `cross_group_recurrence`, `territory_spike`, `schedule_change` e alertas `operational_blocker`/`schedule_change`. Severidade é função simples de menções e quantidade de conversas. Não há comparação temporal nem baseline.

### Read Model

Laboratório e produção compartilham apresentação v0.1.0. O modelo contém `overview`, `movements`, `attention`, `territories`, `conversations`, `recent_events`, `health` e proveniência. Conversas são derivadas dos eventos da janela. O caminho persistido executa `canonicalizeConversationEvent`, removendo caracteres invisíveis e sufixo “(N mensagens)”, e então troca o ID por `label:<rótulo normalizado>`. Essa correção reduz ruído de notificação, mas torna o rótulo a identidade semântica.

### Radar Web

Há quatro telas: Radar, Situações, Grupos e Status. A tela Grupos oferece busca e cards expansíveis com nome, território, nível de atividade, última atividade, situações, assuntos e trechos. Não possui summary próprio, filtros de tendência/condição, classificação, sparkline ou detalhe dedicado. O frontend é JavaScript/HTML/CSS sem framework e alterna entre laboratório e Supabase.

### Synthetic Lab

| Cenário | Validade na nova visão | Ação |
|---|---|---|
| `normal-day` | válido como atividade cotidiana | KEEP; adicionar métricas temporais |
| `material-shortage` | válido como demanda operacional recorrente | KEEP |
| `event-time-change` | válido como mudança de agenda | KEEP |
| `same-topic-multiple-groups` | válido e central para contexto | EXTEND com grupos do mesmo contexto |
| `noise-heavy` | válido para precisão | KEEP |
| `high-volume` | válido para escala e falsos positivos | KEEP |
| `offline-recovery` | válido e essencial para confiança | EXTEND com tendência invalidada |
| `territory-spike` | válido apenas como caso particular | RENAME futuro para `context-spike-territory`; manter fixture durante compatibilidade |

## 3. Nova visão consolidada

O objeto central passa a ser o **grupo observado e governável**, ligado a um contexto opcional ou obrigatório conforme sua origem. Território continua útil, mas deixa de estruturar universalmente o produto. O Radar apresenta três dimensões independentes:

- **condição:** impacto operacional atual;
- **tendência:** direção matemática da métrica;
- **confiança:** validade da observação diante da saúde da captura.

Atividade é volume observável; vitalidade combina atividade recente, recorrência e continuidade, sem alegar leitura, pessoas únicas ou intenção. `sender_ref` permite no máximo amplitude observável e somente após validar estabilidade do identificador.

## 4. Delta Map

| Componente atual | Estado atual | Nova necessidade | Impacto | Tipo | Prioridade |
|---|---|---|---|---|---|
| `NormalizedEvent` | source-agnostic e estável | preservar evidência da fonte | nenhum campo obrigatório novo | KEEP | P0 |
| Android parser | ID derivado do nome | emitir melhor evidência quando disponível | mudança só se fixtures provarem ID melhor | KEEP | P2 |
| canonicalização por label | corrige sufixo e redefine ID | separar normalização de identidade | mover resolução ao processing | REFACTOR | P0 |
| `normalized_events` | fatos imutáveis | ligação analítica com grupo | não reescrever histórico | KEEP | P0 |
| schema | sem grupo persistente | registry, alias, métricas | três tabelas e RLS | CREATE | P0 |
| intelligence | snapshot único e regras globais | métricas por grupo + tendência | extensão determinística | EXTEND | P1 |
| `territory_spike` | nome universalizante | contexto genérico | manter compatibilidade, criar `context_spike` | DEPRECATE | P1 |
| read model v0.1 | `conversations` e `territories` | `groups`, context, condition/trend/confidence | v0.2 aditivo | EXTEND | P1 |
| tela Grupos | lista expansível | Control Center | header, filtros, cards e detalhe | REFACTOR | P1 |
| Status | saúde da fonte isolada | confiança por janela/grupo | derivação no backend | EXTEND | P0 |
| fixtures | oito cenários de snapshot | comparação temporal e identidade | novos cenários pareados | EXTEND | P0/P1 |
| testes | contratos e ground truth atual | migração, aliases, tendências e fallback | cobertura nova | EXTEND | P0 |
| docs/manual | visão territorial | contexto e limites de mensuração | revisão explícita | CHANGE | P0 |

## 5. O que continua igual

- Fronteira source-agnostic e `NormalizedEvent` v0.1.0.
- Semântica at-least-once e IDs determinísticos.
- Evento bruto como evidência imutável.
- Outbox, heartbeat e diagnóstico Android.
- Auth de dispositivos separada de usuários e RLS por rede.
- Processamento reproduzível e transacional por janela.
- Fact -> Signal -> Alert e referências aos eventos de origem.
- Provider único de apresentação entre laboratório e produção.
- Resumo -> detalhe -> evidência.
- Limite: não CRM, não disparo, não perfil individual.

## 6. O que muda

- `conversation_id` deixa de ser interpretado como identidade canônica.
- Território deixa de ser obrigatório e passa a ser um tipo/atributo contextual.
- “atividade alta/média/baixa” deixa de substituir condição e tendência.
- A janela atual passa a ser comparada com a anterior equivalente.
- A saúde de captura passa a validar ou invalidar tendência.
- A feature Grupos passa de lista de conversas para centro de operação da rede.
- Classificação de grupos passa a ser um fluxo administrativo auditável.

## 7. O que precisa ser criado

1. `groups`, `group_aliases` e `group_metric_windows`.
2. resolvedor de identidade no processamento.
3. comando administrativo mínimo para classificar e confirmar alias.
4. read model v0.2 com `groups`.
5. Trend Engine determinístico.
6. Control Center com detalhe responsivo.
7. fixtures e testes de identidade, tempo, confiança, duplicação e Communities em operação real.

`communities` como entidade só entra depois que a captura real justificar a relação. `tracked_entities` e análise agregada de menções/reação podem evoluir em paralelo depois da fundação mínima de identidade, sem funcionar como gate para ela.

## 8. Impacto no banco

### `groups` — menor registry útil

| Campo | Fase | Motivo |
|---|---|---|
| `id uuid PK` | MUST | identidade canônica |
| `network_id uuid FK` | MUST | isolamento/RLS |
| `current_label text` | MUST | nome exibido atual |
| `origin legacy|managed` | MUST | política operacional |
| `context_type territory|leadership|project|theme|community|event|organic|other` | MUST, nullable para legacy | classificação principal |
| `context_label text` | MUST, nullable | rótulo humano sem ontologia |
| `status active|inactive|archived` | MUST | ciclo de vida |
| `naming_status observed|approved|noncompliant` | SHOULD | governança de nome |
| `first_seen_at`, `last_seen_at` | MUST | descoberta e atividade |
| `created_at`, `updated_at` | MUST | auditoria básica |
| `municipality`, `territory` | SHOULD, nullable | filtros operacionais sem universalizar território |
| `responsible_ref` | SHOULD, nullable | responsável operacional, nunca perfil de participante |
| `community_id` | LATER | depende de evidência de Communities |
| `canonical_label` separado | LATER | `current_label` aprovado basta no MVP |

Na operação inicial, `origin` aceita `legacy`, `current_operation` e `unknown`. Nenhuma regra rígida deve bloquear a entrada de grupos que já estão sendo incorporados. Depois que a política operacional for confirmada, `managed` pode substituir ou especializar `current_operation` e exigir `context_type`, `context_label` e nome aprovado. Responsável continua opcional; legacy e unknown podem permanecer sem contexto.

### `group_aliases`

Campos MUST: `id`, `network_id`, `group_id`, `source`, `source_conversation_id`, `observed_label`, `normalized_label`, `first_seen_at`, `last_seen_at`, `resolution_status` (`automatic|confirmed|ambiguous|rejected`), `confidence`, timestamps. Restrição única recomendada: `(network_id, source, source_conversation_id, normalized_label)`; não tornar apenas o rótulo único.

Alias automático é permitido quando um `source_conversation_id` já confirmado reaparece com variação apenas cosmética, ou quando existe uma única correspondência inequívoca na mesma fonte. Renomeação substantiva, nome duplicado ou fusão entre fontes exige confirmação humana.

### `group_metric_windows`

Campos MUST: `processing_run_id`, `network_id`, `group_id`, `starts_at`, `ends_at`, `event_count`, `fact_count`, `alert_count`, `problem_count`, `demand_count`, `agenda_count`, `open_situation_count`, `capture_confidence`, `created_at`. `active_sender_count` entra somente após teste de estabilidade de `sender_ref`. Sparkline não é armazenada: resulta das últimas janelas.

Escolha: **tabela atualizada pelo processamento**, não cálculo on demand nem materialized view. Ela reutiliza a transação, registra versão/janela e mantém leitura simples. Na escala atual, agregados podem ser recompostos integralmente. Uma view pode expor current/previous mais tarde.

Todas as tabelas recebem RLS por `network_id`; mutations administrativas devem exigir `owner` ou `operator`. Não expor escrita direta anônima.

## 9. Impacto no Android

P0 não muda Android. O adapter continua produzindo evidência da fonte. O Core não deve exigir `group_id` do aparelho. Isso evita nova versão de contrato e mantém Fake Sensor/WAHA compatíveis.

P2 condicionado a fixtures reais: verificar se notificações trazem shortcut/conversation key estável, `Person.key` ou outro identificador não nominal. Se comprovado, adicionar em `metadata.source_conversation_key` numa versão compatível e usar como evidência mais forte. Nunca prometer que título do WhatsApp é um ID.

Novos testes físicos: renomeação, dois grupos com mesmo nome, grupo de Community, announcement group e títulos com contagem. Nenhuma classificação de contexto deve ocorrer no aparelho.

## 10. Impacto no Core

O ingest permanece intacto. O `process-window` passa a:

1. carregar janela atual e anterior equivalente;
2. normalizar rótulos sem substituir o ID bruto;
3. resolver ou criar grupo/alias sob regras determinísticas;
4. registrar ambiguidades sem fundir históricos;
5. executar inteligência existente;
6. persistir métricas atuais e comparação;
7. calcular confiança a partir de `adapter_health`, transições e lacunas;
8. persistir tudo na RPC transacional revisada.

Fallback: se registry falhar ou flag estiver desligada, o read model v0.1 continua agregando conversas como hoje. Rollback desliga a flag; tabelas aditivas permanecem sem afetar ingestão.

## 11. Impacto na Intelligence

### Regras atuais

| Regra/categoria | Decisão |
|---|---|
| `material_logistica` | KEEP |
| `agenda_mobilizacao` | KEEP |
| `duvida_orientacao` | KEEP |
| `demanda_territorial` | KEEP como categoria específica, não universal |
| `problema_operacional` | KEEP |
| `alegacao_verificar` | KEEP com cautela |
| `cross_group_recurrence` | KEEP; agrupar também por contexto quando conhecido |
| `schedule_change` | KEEP |
| `operational_blocker` | KEEP |
| `territory_spike` | DEPRECATE depois de compatibilidade; substituir por `context_spike` com `context_type` |
| `activity_spike`, `activity_drop`, `inactive_group` | ADD em P1 via Trend Engine |
| `tracked_entity_spike` | P2 após registry de entidades |

Não criar alertas apenas por crescimento/queda. Tendência alimenta condição; alertas exigem relevância semântica ou limiar operacional explícito.

## 12. Impacto no Read Model

Criar schema de apresentação v0.2 aditivo:

```json
{
  "groups": [{
    "id": "uuid",
    "label": "string",
    "origin": "legacy|managed",
    "context": { "type": "theme", "label": "Mobilização" },
    "condition": "normal|watch|attention|critical",
    "trend": { "direction": "growing|stable|declining|unavailable", "absolute_delta": 0, "percent_delta": null },
    "sparkline": [0, 0, 0],
    "event_count": 0,
    "open_situation_count": 0,
    "topics": [],
    "last_seen_at": "timestamp",
    "capture_confidence": "high|moderate|low|unavailable"
  }]
}
```

Durante uma versão, retornar `conversations` como projeção de `groups` para não quebrar a UI antiga. `territories` continua como corte opcional; adicionar `contexts` como agregação genérica. Synthetic builder e persisted builder devem passar pelos mesmos testes de shape.

## 13. Impacto na UI/UX

Separar tokens: `--brand-red` para identidade, `--severity-critical` para condição crítica, `--severity-warning`, `--condition-healthy`, `--neutral`, além de cores de tendência neutras. Seta/sparkline representa direção; badge e cor representam condição. Nunca pintar crescimento de verde por padrão.

Detalhe recomendado: **drawer lateral no desktop e página full-screen no mobile**. O drawer preserva comparação/lista; no mobile, modal ou bottom sheet comprime conteúdo demais. Estrutura: overview, histórico, movimentos, situações, contexto, evidências e confiança.

## 14. Feature Grupos — Control Center

### Header

Cinco números: monitorados, ativos no período, em atenção, caindo com confiança suficiente e sem classificação. Evitar somar “crescendo” no header se já houver excesso visual.

### Filtros e ordenação

P1: condição, tendência, sem atividade, não classificados, contexto e legacy/managed. Município, território, responsável e comunidade aparecem somente quando houver dados. Ordenação: maior atenção, maior queda, maior crescimento, maior atividade, mais recente.

### Card fechado

Mostrar no máximo: nome; contexto/origem; badge de condição; seta + delta/sparkline; atividade do período; situações abertas; última atividade; ícone de confiança quando não alta. Assuntos ficam no detalhe ou limitados a dois chips. Não mostrar simultaneamente todos os campos administrativos.

## 15. Trend Engine

Fase 1 usa duas janelas iguais e adjacentes. Para cada métrica:

- `absolute_delta = current - previous`;
- percentual somente quando `previous >= 5` e volume combinado >= 10;
- direção `stable` quando `abs(delta) < max(2, 20% do previous)`;
- `growing`/`declining` fora da faixa;
- `unavailable` quando não há janela anterior válida ou confiança baixa/indisponível.

O limiar deve ser configurado por métrica, não um único score. Em 1 -> 2, exibir “+1” e classificar como estável/volume insuficiente, nunca “+100%” como destaque. Métricas iniciais: `event_count`, facts, alertas/situações, demandas, agenda e problemas. `tracked_entity_mentions` é P2.

### Baseline em fases

1. **Período contra período:** habilitar imediatamente após duas janelas confiáveis.
2. **Média móvel:** após ao menos 14 janelas comparáveis e rotina estável.
3. **Baseline por grupo:** após 4 semanas úteis e evidência de sazonalidade. Antes disso produz falsa precisão.

## 16. Capture Confidence

Derivar por janela usando heartbeats, `listener_connected`, `notification_access`, `network_type`, backlog, último evento/upload e transições:

- **high:** cobertura esperada da janela, listener/acesso ativos, sem outage material, fila drenada;
- **moderate:** lacuna curta ou recovery sem perda aparente;
- **low:** outage relevante, listener desconectado, fila persistente ou cobertura parcial;
- **unavailable:** sem heartbeat suficiente para avaliar.

Se low/unavailable, tendência vira `unavailable`; o card mostra “captura insuficiente”, sem concluir queda. Moderate permite direção com aviso. Confidence é atributo de observação, não qualidade do grupo. Inicialmente use confiança da fonte/rede para todos os grupos do dispositivo; granularidade por grupo só quando houver evidência específica.

## 17. Group Registry e identidade

### Alternativas

| Opção | Custo | Risco | Avaliação |
|---|---|---|---|
| A manter ID atual | baixo | fragmenta/funde histórico | rejeitada |
| B registry sem ligação | baixo | catálogo não corrige métricas | insuficiente |
| C resolver no ingest | alto | acopla ingestão, bloqueia e reescreve semântica cedo | rejeitada agora |
| D resolver no processing | médio | requer tratamento de ambiguidade | boa |
| E migrar todo evento para `group_id` | alto | mutação histórica e rollback difícil | rejeitada |
| F híbrida | médio | duas identidades precisam documentação | escolhida |

Na híbrida, D é aplicado preservando A como evidência. Eventos existentes são retroassociados no processamento sem UPDATE. `group_aliases` pode ser preenchida por backfill idempotente. Dados ambíguos permanecem “grupo observado não resolvido” até confirmação; é melhor subcontar continuidade do que fundir grupos incorretamente.

## 18. Classification, legacy e managed

`origin` deve ser campo persistido. Policy e validação pertencem ao backend; o frontend replica regras para feedback imediato.

- **Legacy:** nome livre; contexto, responsável e território opcionais; UI destaca pendências sem impedir observação.
- **Managed:** nome aprovado; `context_type` e `context_label` obrigatórios; responsável recomendado; comunidade opcional.

Interface administrativa mínima: editar origem, contexto, município, território e referência do responsável; confirmar/rejeitar alias; arquivar grupo. Sugestões automáticas podem propor tipo/rótulo a partir do nome, sempre com rótulo “sugestão” e confirmação humana. A baseline determinística deve ser regex/dicionário antes de IA.

A classificação precisa ser auditável sem criar burocracia. `groups` mantém `classification_status` (`unclassified|partially_classified|confirmed`), `classification_source` (`observed|manual|suggested|imported`), `classified_by` e `classified_at`. Uma tabela `group_classification_changes` registra `group_id`, autor, instante, campo, valor anterior, valor novo e origem da mudança. O histórico cobre apenas metadata administrativa; não duplica mensagens nem cria perfis. Viewer apenas lê; operator autorizado e community manager classificam; owner administra regras e aliases. Não há aprovação dupla obrigatória e grupo sem classificação continua sendo observado.

Communities não vira entidade em P0/P1. Primeiro capturar fixtures. Se houver ID/nome estáveis e necessidade de filtro, criar `communities(id, network_id, name)` e FK nullable em `groups`; sem hierarquia ou gerenciamento próprio.

## 19. Testes

| Cenário novo | Entrada | Métrica esperada | UI | Alerta |
|---|---|---|---|---|
| `activity-growth` | 10 -> 18 eventos, captura high | growing, +8, +80% | seta ↑, condição independente | não por si só |
| `activity-stability` | 10 -> 11 | stable | seta → | não |
| `activity-decline` | 18 -> 8, captura high | declining, -10 | seta ↓ | não automático |
| `decline-with-capture-outage` | 18 -> 3 + outage | trend unavailable | aviso de captura | não |
| `legacy-unknown-context` | grupo sem classificação | registry legacy/null | filtro não classificado | não |
| `manual-classification` | update por operator | contexto persistido/auditável | card atualizado | não |
| `group-renamed` | IDs/labels observados e alias confirmado | um `group_id`, histórico contínuo | nome atual | não |
| `same-context-multiple-groups` | dois grupos, um contexto | 2 grupos no contexto | filtro correto | conforme semântica |
| `same-territory-multiple-leaders` | mesmo território, contextos liderança distintos | sem fusão | cards separados | não |
| `actor-mention-spike` | menções agregadas a entidade | contagem por grupos | movimento agregado | P2, limiar explícito |
| `community-announcement` | fixture de announcement | identidade sem falso grupo | tipo evidenciado | não |
| `inactive-group` | histórico e zero atual com high confidence | inactive/declining | estado sem atividade | configurável, não padrão |

Adicionar testes de RLS owner/operator/viewer, backfill idempotente, alias ambíguo, nomes duplicados, rollback por flag, paridade lab/live, percentuais com denominador baixo e propriedade “low confidence nunca produz declining”.

## 20. Migração

### Phase 0 — estabilização da operação ativa

A entrada de grupos já está em curso e não depende de piloto futuro. Criar tabelas/RLS, resolvedor em modo shadow e fixtures sem interromper captura, ingestão ou inclusão de novos grupos. Popular o registry progressivamente, detectar duplicações, renomeações, Communities, resolvidos, novos, ambíguos, não classificados e colisões. O gerente de comunidade classifica enquanto a operação segue. Rollback: desligar shadow e manter o read model atual.

### Phase 1 — registry read-only

Backfill por rede/fonte/ID/rótulo; revisar ambiguidades; expor diagnóstico administrativo. Nenhum evento é atualizado.

### Phase 2 — classificação manual

Permitir operator/owner editar grupos e confirmar aliases. Auditoria mínima por timestamps e identidade do usuário na mutation/RPC.

### Phase 3 — métricas

Persistir janelas atual/anterior e confiança dentro de `persist_analysis` v2. Validar contra fixtures e produção shadow.

### Phase 4 — Groups UI

Ativar read model v0.2 e Control Center por flag de rede/runtime. Manter `conversations` por uma versão. Fallback para lista atual.

### Phase 5 — inteligência avançada

Ativar `context_spike`, tendência operacional e, após dados, entidades monitoradas.

## 21. Riscos

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| quebra da ingestão | baixa | alto | não alterar contrato/handler em P0 |
| IDs inconsistentes | alta hoje | alto | registry + aliases + shadow |
| fragmentação histórica | alta hoje | alto | associação no processing e confirmação |
| fusão por nome duplicado | média/alta | alto | nunca resolver somente por label ambíguo |
| duplicidade de grupo | média | médio | unique constraints e backfill idempotente |
| tendência falsa | alta sem health | alto | confidence gate e volume mínimo |
| read model regressivo | média | alto | v0.2 aditivo, paridade e feature flag |
| UI sobrecarregada | média | médio | card limitado e detalhe progressivo |
| schema inflado | média | médio | três tabelas P0/P1; communities/entities depois |
| CRM acidental | média | alto | nenhum participant profile; responsible é função operacional |
| overengineering | média | médio | período anterior antes de baseline/ontologia/RAG |

## 22. Roadmap executável

### Prompts oficiais de execução

O roadmap é executado por prompts versionados em [`docs/implementation-prompts/`](implementation-prompts/README.md):

1. [`P0 — Estabilização da operação ativa`](implementation-prompts/P0-ESTABILIZACAO-OPERACAO-ATIVA.md);
2. [`P1 — Métricas, tendências e Control Center`](implementation-prompts/P1-METRICAS-CONTROL-CENTER.md);
3. [`P2 — Inteligência política agregada, segmentação e consultas`](implementation-prompts/P2-INTELIGENCIA-POLITICA-CONSULTAS.md).

Cada prompt deve ser executado em uma tarefa própria contra a `main` mais recente. O agente verifica o gate anterior no código e nos testes antes de avançar. Uma fase incompleta não deve ser ocultada dentro da seguinte, mas a operação ativa também não deve ser interrompida: ingestão e fallback permanecem disponíveis durante todo o rollout.

### P0 — Estabilização da operação ativa

1. **Schema do registry, aliases e auditoria de classificação.** Componentes: schema declarativo, migration, RLS, checks. Dependência: decisão D-017. Teste: constraints/RLS/backfill/histórico. Risco: colisão. Pronto quando a operação continua recebendo grupos e o shadow não altera ingestão.
2. **Resolvedor shadow e controle de duplicação.** Componentes: shared canonicalization, processing e payload. Teste: rename/duplicate/ambiguous/notificação cumulativa. Pronto quando registra decisão e motivo por evento/grupo e duplicações não inflam métricas.
3. **Classificação progressiva em produção.** Componentes: registry, mutations administrativas e UI mínima. Pronto quando o gerente classifica sem bloquear grupos ainda desconhecidos e toda alteração fica rastreável.
4. **Confidence por janela.** Componentes: capture-health, processing. Teste: outage invalida trend. Pronto quando nenhuma queda é emitida com low confidence.
5. **Cenários temporais e Communities.** Componentes: testkit, fixtures, ground truth e evidência real. Pronto com cenários reproduzíveis e comportamento documentado.
6. **Documentação e vocabulário.** Atualizar decisões, inteligência, UX, manual e matriz.

### P1 — Groups Intelligence

1. Persistir `group_metric_windows` e comparação anterior.
2. Read model v0.2 aditivo, `groups` + `contexts` e alias `conversations`.
3. Interface administrativa para classificação/alias.
4. Control Center com summary, filtros, ordenação, cards e drawer/full-screen.
5. `context_spike`, `activity_spike/drop` e `inactive_group` somente após calibração em shadow.

Definição conjunta de pronto: migração reversível; lab/live iguais; RLS validada; UI não afirma queda sem confiança; produção antiga continua legível.

### P2 — Inteligência política e consultas avançadas

- `tracked_entities` mínimo (`id`, `network_id`, `name`, `aliases`, `type`, `enabled`) e menções agregadas;
- reação/sentimento agregado por entidade, assunto, contexto e janela, com método, confiança, evidências amostrais e revisão humana disponível;
- segmentação analítica por grupos/contextos classificados, sem perfil de participante, acompanhada de permissões e registro de consulta;
- Communities somente após fixtures;
- média móvel e baseline por grupo após histórico suficiente;
- consulta em linguagem natural traduzida para operações estruturadas e autorizadas;
- observabilidade de IA: task type, modelo, chamadas, caracteres/tokens e custo estimado antes da primeira execução com IA.

### Parking lot / não implementar ainda

RAG completo, embeddings, LLM indiscriminado em todas as mensagens, score de liderança, CRM de participantes, read receipts, inferência automática de intenção de voto, outbound, mapas complexos e ontologia territorial. Reação/sentimento e segmentação estão autorizados, mas entram como análises agregadas e controladas; não podem ser convertidos silenciosamente em perfil individual ou apoio eleitoral.

Perguntas como “quais grupos cresceram?” e “onde faltou material?” devem virar filtros/SQL sobre métricas e facts. LLM pode futuramente resumir uma resposta estruturada, mas não escolher escopo ou recuperar dados fora da autorização. RAG só se houver corpus documental real que SQL não represente.

## 23. KEEP / CHANGE / ADD / REMOVE

### KEEP

Contratos v0.1, ingestão, eventos imutáveis, outbox/heartbeat, Auth/RLS, processamento por janela, proveniência, facts/signals/alerts, providers e laboratório.

### CHANGE

Canonicalização de identidade, processamento, read model, linguagem territorial universal, cards de grupos, semântica de atividade e matriz de testes.

### ADD

Registry, aliases, métricas por janela, resolvedor, classificação, condition/trend/confidence, Control Center, detail drawer e novos cenários.

### REMOVE / DEPRECATE

Uso do rótulo como identidade canônica, `territory_spike` como conceito geral, seta colorida como impacto, atividade como proxy de engajamento e `conversations` como nome público definitivo. Remoção física só após compatibilidade v0.2.

## 24. Decision Log proposto

### D-017 — Identidade híbrida de grupos

**Status:** PROPOSTA  
**Decisão:** preservar identidade observada no evento e resolver `group_id` no processamento por registry/aliases.  
**Motivo:** continuidade sem acoplar ou reescrever ingestão.  
**Impacto:** novas tabelas, resolvedor e tratamento de ambiguidade.  
**Reabrir se:** uma fonte estável e universal de group ID for comprovada.

### D-018 — Contexto primário proporcional

**Status:** PROPOSTA  
**Decisão:** `context_type` + `context_label` no grupo; território é opcional; sem M:N no MVP.  
**Motivo:** cobre a visão sem ontologia prematura.  
**Impacto:** registry, filtros e read model.  
**Reabrir se:** grupos precisarem operacionalmente de múltiplos contextos simultâneos.

### D-019 — Condição, tendência e confiança independentes

**Status:** PROPOSTA  
**Decisão:** direção matemática, impacto operacional e validade da captura são campos distintos.  
**Motivo:** evita inferências enganosas.  
**Impacto:** métricas, intelligence e UI.  
**Reabrir se:** pesquisa mostrar outro modelo mais compreensível sem perda semântica.

### D-020 — Métricas persistidas por janela

**Status:** PROPOSTA  
**Decisão:** persistir agregados por grupo no processamento transacional.  
**Motivo:** comparação reproduzível e leitura simples.  
**Impacto:** schema, `persist_analysis` e read model.  
**Reabrir se:** escala justificar materialized view ou processamento incremental.

### D-021 — IA subordinada à baseline estruturada

**Status:** PROPOSTA  
**Decisão:** SQL/regras primeiro; IA somente com avaliação e observabilidade de custo/qualidade.  
**Motivo:** confiabilidade, auditabilidade e custo.  
**Impacto:** RAG/LLM permanecem fora de P0/P1.  
**Reabrir se:** tarefa definida superar baseline em teste controlado.

## 25. Próxima ação recomendada

Executar P0 sobre a operação ativa, sem aguardar piloto e sem interromper a inclusão de grupos. Começar por D-018/D-019/D-020 e uma migration **somente aditiva** para `groups`, `group_aliases` e `group_classification_changes`. Implementar o resolvedor em shadow, o controle de duplicação e a classificação auditável progressiva. O primeiro relatório deve mostrar identidades resolvidas, ambíguas, colisões, duplicações evitadas e grupos ainda não classificados. Depois persistir métricas e ativar gradualmente o Control Center. Governança é aplicada por permissões, rastreabilidade e controles internos do sistema; não constitui gate externo de implementação. Menções políticas, reação/sentimento agregado e segmentação podem avançar como módulos controlados após a identidade mínima estar operacional.

## Change surface verificada

### Android

- `apps/android-sensor/app/src/main/java/br/com/radardarede/sensor/capture/NotificationParser.kt`
- `apps/android-sensor/app/src/test/java/br/com/radardarede/sensor/capture/MessagingStyleWhatsAppParserTest.kt`

### Contracts/Core/Supabase

- `packages/contracts/schemas/normalized-event.v0.1.0.schema.json` (KEEP; teste de não regressão)
- `supabase/schemas/core.sql`
- nova migration em `supabase/migrations/`
- `supabase/functions/_shared/canonical-conversations.js`
- `supabase/functions/_shared/analysis-payload.js`
- `supabase/functions/_shared/intelligence.js`
- `supabase/functions/process-window/index.ts`
- `supabase/functions/process-latest-window/index.ts`
- `supabase/functions/_shared/radar-read-model.js`
- `supabase/functions/radar-read-model/index.ts`
- `packages/supabase-core/scripts/check-supabase.mjs`
- `packages/supabase-core/test/analysis-payload.test.js`
- `packages/supabase-core/test/radar-read-model.test.js`

### Intelligence/read model/web

- `packages/intelligence/src/index.js`
- `packages/intelligence/test/intelligence.test.js`
- `packages/radar-view-model/src/index.js`
- `packages/radar-view-model/test/view-model.test.js`
- `apps/radar-web/public/index.html`
- `apps/radar-web/public/app.js`
- `apps/radar-web/public/styles.css`
- `apps/radar-web/test/web.test.js`

### Fixtures/docs

- `fixtures/synthetic/*/scenario.json`
- `packages/testkit/src/index.js`
- `packages/testkit/test/scenarios.test.js`
- `docs/PROJECT.md`, `docs/DECISIONS.md`, `docs/INTELLIGENCE.md`, `docs/UX.md`, `docs/TEST_MATRIX.md`, `docs/TASKS.md`
