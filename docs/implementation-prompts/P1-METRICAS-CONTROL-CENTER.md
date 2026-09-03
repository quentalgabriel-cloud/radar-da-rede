# PROMPT P1 — Métricas, tendências e Control Center de Grupos

## Papel e missão

Atue como Staff Product Engineer, Analytics/Data Architect, UX Systems Designer, Supabase Engineer, Accessibility/QA Engineer e Reliability Engineer. Execute P1 sobre a fundação P0 comprovada, preservando a operação ativa e o fallback atual.

## Pré-condição obrigatória

Leia o relatório de saída de P0 e confirme no código/testes:

- `groups`, `group_aliases` e auditoria existem e têm RLS;
- resolver shadow está estável e ambiguidades não fundem grupos;
- deduplicação coberta não infla eventos;
- capture confidence está disponível;
- rollback/read model v0.1 funciona.

Se algum item faltar, corrija a lacuna ou declare P1 bloqueada com evidência. Não simule a fundação.

## Objetivo de P1

Entregar métricas reproduzíveis por grupo e janela, separar condição/tendência/confiança, criar read model v0.2 aditivo e transformar Grupos em Control Center utilizável no desktop e mobile.

## Ajustes de execução após o fechamento real da P0

- Use a ligação `observation_key -> group_id` retornada pelo resolvedor durante o processamento; não tente reconstruir identidade por label no browser ou depois da persistência.
- O diagnóstico de campo não prova todos os campos de saúde. Campo ausente produz `capture_confidence=unavailable`.
- Persista métricas em shadow desde a primeira janela, mas não fabrique tendência sem janela anterior equivalente.
- A flag do Control Center é independente da flag do resolvedor P0. O rollout começa desligado e só é recomendado após duas janelas comparáveis ou fixtures explícitas.
- `active_sender_count` fica fora desta entrega: estabilidade entre fontes/dispositivos ainda não foi comprovada.
- O relatório consolidado anterior à P0 contém descrições históricas desatualizadas; código, migrations e `docs/P0-CLOSURE-REPORT.md` são a fonte do estado atual.

## Etapa 1 — Contrato analítico

Defina e teste o contrato de `group_metric_windows`:

- `processing_run_id`, `network_id`, `group_id`;
- `starts_at`, `ends_at`;
- `event_count`, `fact_count`, `alert_count`;
- `demand_count`, `agenda_count`, `problem_count`;
- `open_situation_count`;
- `active_sender_count` somente se estabilidade/semântica de `sender_ref` estiver comprovada;
- `capture_confidence`;
- métricas/versionamento necessário;
- `created_at`.

Persistir via processamento transacional existente. A mesma entrada/janela deve produzir o mesmo resultado lógico. Não calcular tudo no browser e não criar materialized view sem necessidade demonstrada.

## Etapa 2 — Trend Engine determinístico

Carregue janela atual e anterior equivalente. Para cada métrica, produza:

- valor atual/anterior;
- delta absoluto;
- delta percentual nullable;
- `growing|stable|declining|unavailable`;
- volume/razão que sustentou a direção.

Regras iniciais:

- percentual só quando anterior >= 5 e volume combinado >= 10;
- stable se `abs(delta) < max(2, 20% do anterior)`;
- 1 -> 2 mostra +1/volume insuficiente, nunca destaque “+100%”;
- low/unavailable confidence produz trend unavailable;
- moderate mostra aviso;
- limiares podem variar por métrica e ficam versionados/testados.

Não confunda crescimento com impacto positivo. Não gere alerta apenas pela direção.

## Etapa 3 — Condition Engine

Modele `normal|watch|attention|critical` separadamente de trend. Derive de situações/alertas e regras operacionais explícitas. Até que thresholds sejam confirmados, use apenas regras já justificadas e marque o restante como hipótese/configuração.

Teste combinações como normal+growing, attention+declining, critical+stable e normal+declining. Cor representa condition; seta/sparkline representa trend.

## Etapa 4 — Read model v0.2

Crie schema aditivo contendo `groups` com:

- id, label, origin;
- contexto primário;
- condition;
- trend/deltas;
- sparkline de janelas reais;
- event_count;
- open_situation_count;
- topics;
- last_seen_at;
- capture_confidence;
- classification status quando útil à operação.

Adicione agregação `contexts`. Preserve `territories` como corte opcional. Retorne `conversations` temporariamente como projeção compatível. Synthetic e persisted builders devem produzir o mesmo shape e semântica.

Não vaze schema do banco, chaves privilegiadas ou detalhes do Source Adapter para componentes visuais.

## Etapa 5 — Control Center

### Header

Mostrar monitorados, ativos no período, em atenção, caindo com confiança suficiente e não classificados.

### Filtros

Condition, trend, sem atividade, não classificados, contexto e origin. Município, território, responsável e Community somente quando houver dados reais. Ordenações: maior atenção, maior queda, maior crescimento, maior atividade e mais recente.

### Card fechado

Limite cognitivo: nome, contexto/origin, condition badge, trend/delta ou sparkline, atividade, situações abertas, última atividade e aviso de confidence quando não high. No máximo dois assuntos; restante no detalhe.

### Detalhe

Drawer lateral no desktop e full-screen no mobile, com overview, histórico, movimentos/tópicos, situações, contexto, evidências e confidence. Preserve foco, teclado, leitores de tela, reduced motion e responsividade.

### Classificação

Integrar edição/histórico administrativo entregue em P0 sem transformar o card em formulário. Sugestões continuam distinguíveis de confirmações.

## Etapa 6 — Feature flag, rollout e fallback

Ative v0.2/Control Center por flag runtime ou de rede. Permita retorno ao read model/tela anterior. Faça shadow comparison entre métricas antigas e novas. Não remova `conversations` nesta fase.

## Fixtures e testes obrigatórios

- `activity-growth`;
- `activity-stability`;
- `activity-decline`;
- `decline-with-capture-outage`;
- `legacy-unknown-context`;
- `manual-classification`;
- `group-renamed`;
- `same-context-multiple-groups`;
- `same-territory-multiple-leaders`;
- `inactive-group`;
- baixo denominador e janela anterior vazia;
- paridade synthetic/live;
- contract v0.1 fallback e v0.2;
- filtros/ordenação;
- acessibilidade do drawer/full-screen;
- segurança de escape de conteúdo externo;
- refresh concorrente/aba oculta continua correto.

Para cada cenário, registre input, métricas esperadas, UI esperada e alerta/no alert.

## Não implementar em P1

Baseline por grupo sem histórico, média móvel prematura, score único, contextos M:N, CRM, perfil de liderança, RAG, sentimento ou segmentação misturados ao Trend Engine. P2 pode usar a fundação, mas não deve contaminar a entrega de métricas básicas.

## Gate de saída P1

- métricas persistidas são idempotentes e versionadas;
- trend respeita volume e confidence;
- condition é independente da direção;
- read model v0.2 tem paridade lab/live;
- Control Center funciona e é acessível;
- classificação/histórico permanece operacional;
- flag e fallback foram testados;
- nenhum indicador afirma leitura, pessoas únicas ou intenção;
- testes locais/CI passam e evidências estão documentadas;
- P0 permanece íntegro.

Finalize com resumo, screenshots/evidências quando disponíveis, testes, riscos, rollout, rollback e recomendação objetiva sobre habilitar a flag. Não inicie P2 silenciosamente.
