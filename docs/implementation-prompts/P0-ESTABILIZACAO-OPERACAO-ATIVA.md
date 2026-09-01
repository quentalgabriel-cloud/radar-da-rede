# PROMPT P0 — Estabilização da operação ativa

## Papel e missão

Atue como Principal Product Engineer, Staff Architect, Data/Supabase Engineer, Android ingestion specialist, Reliability Engineer e QA Architect. Trabalhe diretamente no repositório Radar da Rede e execute P0 até o gate de saída comprovável.

A operação já está ativa: agentes e gerente de comunidade estão adicionando o contato do Radar aos grupos. Não proponha piloto futuro, congelamento operacional ou recomeço. Evolua o sistema sem interromper captura, ingestão, heartbeat, processamento e Radar Web existentes.

## Leitura obrigatória

Antes de editar, leia `AGENTS.md`, `README.md`, `docs/PROJECT.md`, `docs/DECISIONS.md`, `docs/TEST_MATRIX.md`, `docs/DEEP_IMPLEMENTATION_IMPACT_REVIEW.md`, schemas, migrations, contratos, Edge Functions, Android e testes existentes. Confirme paths com `rg --files`. Trate documentação como contexto; confirme comportamento no código.

## Objetivo de P0

Entregar fundação aditiva e reversível para:

1. identidade canônica de grupos sem destruir a identidade observada;
2. aliases e renomeações;
3. classificação progressiva e auditável;
4. controle comprovável de duplicações técnicas;
5. capture confidence por janela;
6. observação segura de Communities;
7. operação shadow mensurável antes de alterar a experiência principal.

## Decisões obrigatórias

- Preserve `NormalizedEvent` v0.1.0 e `normalized_events` imutáveis.
- Não exija `group_id` do Android.
- Preserve `conversation_id` como identidade observada da fonte.
- Resolva `group_id` no processamento.
- Nunca funda dois grupos somente porque têm o mesmo nome.
- Grupo desconhecido continua entrando como provisório/não classificado.
- Sugestão automática nunca equivale a confirmação humana.
- Não crie CRM, perfil de participante ou contexto M:N.
- Toda alteração deve ter teste, migração segura e fallback.

## Etapa 1 — Auditoria e plano de mudança

Reconstrua o caminho Android -> ingest -> normalized_events -> process-window -> persist_analysis -> read model. Identifique exatamente onde `canonicalizeConversationEvent` troca o ID por label. Inspecione schema remoto versionado, migrations e RLS. Produza um delta curto antes de editar, incluindo riscos de compatibilidade.

Verifique o estado da `main`, suíte existente e eventuais divergências entre schema declarativo e migrations. Não aplique DDL em projeto remoto sem autorização explícita e mecanismo existente no repositório.

## Etapa 2 — Schema aditivo

Implemente no schema declarativo e em nova migration revisável:

### `groups`

Campos mínimos:

- `id uuid` PK;
- `network_id uuid` FK;
- `current_label text`;
- `origin`: `legacy|current_operation|unknown`;
- `context_type`, nullable: `territory|leadership|project|theme|community|event|organic|other`;
- `context_label`, nullable;
- `municipality`, `territory`, referência operacional principal, nullable;
- `status`: `active|inactive|archived`;
- `naming_status`, somente se houver uso concreto;
- `classification_status`: `unclassified|partially_classified|confirmed`;
- `classification_source`: `observed|manual|suggested|imported`;
- `classified_by` nullable FK para Auth quando aplicável;
- `classified_at` nullable;
- `first_seen_at`, `last_seen_at`, `created_at`, `updated_at`.

Não bloqueie entrada por contexto/responsável/naming. Use constraints para coerência, não para impor política ainda não confirmada.

### `group_aliases`

Inclua `id`, `network_id`, `group_id`, `source`, `source_conversation_id`, `observed_label`, `normalized_label`, `first_seen_at`, `last_seen_at`, `resolution_status`, `confidence`, timestamps. Modele unicidade com rede + fonte + evidência observada; não torne label isolado único.

### `group_classification_changes`

Inclua `id`, `network_id`, `group_id`, `changed_by`, `changed_at`, `field_name`, `previous_value`, `new_value`, `change_source`. Registre somente metadata administrativa.

Crie índices para resolução/leitura, RLS por rede e grants mínimos. Reuse `private.is_network_member`. Diferencie leitura de mutation: viewer lê; operator/owner alteram conforme papéis existentes. Se `community_manager` exigir novo papel, proponha e teste a menor extensão; não quebre roles atuais.

Atualize o check estático de Supabase para cobrir novas tabelas, RLS, índices e contratos.

## Etapa 3 — Resolvedor de identidade em shadow

Refatore canonicalização em duas operações:

1. normalização cosmética de label;
2. resolução explícita de grupo.

O resolvedor deve ser determinístico e idempotente:

- alias confirmado/inequívoco reutiliza `group_id`;
- primeira observação cria grupo provisório + alias;
- variação apenas cosmética pode ser automática;
- mudança substantiva é candidata/ambígua;
- labels iguais em evidências incompatíveis não são fundidos;
- rejeição humana impede nova associação automática equivalente;
- toda decisão tem status, confidence e motivo observável.

Execute em shadow: produza/persista ligações e contadores, mas mantenha o read model v0.1 como fallback e não altere a ingestão.

Entregue relatório/consulta com: observados, resolvidos automaticamente, confirmados, novos, ambíguos, rejeitados, colisões e não classificados.

## Etapa 4 — Classificação administrativa auditável

Implemente RPC/mutation protegida para atualizar somente campos permitidos. A operação deve:

- validar rede, papel e valores;
- atualizar status/source/classified_by/classified_at;
- gravar uma linha de histórico por campo alterado;
- não gravar alteração quando valor não mudou;
- ser transacional;
- permitir correção posterior;
- confirmar/rejeitar aliases em operação específica.

Crie interface mínima apenas se o read/write remoto e os papéis estiverem preparados. Caso contrário, entregue contrato/RPC e fixture de UI sem declarar a interface operacional. Não exigir justificativa ou aprovação dupla. Disponibilize “Ver histórico” de modo discreto.

## Etapa 5 — Deduplicação comprovável

Audite os IDs determinísticos Android e a deduplicação do banco. Crie fixtures/testes para:

- MessagingStyle cumulativo;
- mesma mensagem reapresentada;
- notificação removida/recriada;
- retry do batch;
- mesmo texto/horário em grupos diferentes;
- duas mensagens legitimamente iguais no mesmo grupo.

Corrija somente duplicação reproduzida. Prefira identidade/fingerprint persistente; não use similaridade textual genérica ou janela temporal que descarte eventos válidos. Demonstre que replay técnico preserva uma cópia e casos legítimos preservam duas.

## Etapa 6 — Capture confidence

Implemente avaliação por janela com `high|moderate|low|unavailable`, derivada de heartbeats, acesso, listener, rede, backlog, último evento/upload e transições.

Defina regras determinísticas documentadas. Propriedade obrigatória: `low` ou `unavailable` impede qualquer conclusão confiável de queda. Inicialmente confidence pode ser da fonte/rede aplicada aos grupos do dispositivo; não invente precisão por grupo.

## Etapa 7 — Communities e evidência de campo

Prepare fixtures sanitizadas e roteiro para grupo comum, Community, announcement group, rename, labels duplicados e títulos cumulativos. Não crie tabela `communities` sem identificador/relacionamento útil comprovado. Registre o que foi testado e o que depende do aparelho.

## Testes obrigatórios

- schema/RLS/roles;
- backfill/resolução idempotente;
- alias cosmético, rename, duplicate label, ambiguous e rejected;
- grupo não classificado continua processável;
- classification mutation + histórico + no-op;
- sugestão não vira confirmação;
- deduplicação técnica e eventos iguais legítimos;
- confidence healthy/recovery/outage/offline/backlog;
- contrato v0.1 não mudou;
- read model v0.1 continua válido;
- suíte `pnpm verify` e Android workflow quando Android mudar.

## Rollout e rollback

Use feature flag ou modo shadow. Backfill deve ser idempotente e escopado por rede. Não remova colunas/tabelas antigas. Rollback desativa resolução/classificação nova e restaura leitura v0.1; ingestão continua intacta. Não use dados reais de produção em fixtures.

## Documentação e decisões

Atualize `docs/DECISIONS.md` com identidade híbrida, contexto primário e auditoria; `docs/TEST_MATRIX.md`, `docs/TASKS.md`, `docs/SUPABASE.md` e documentação Android quando aplicável. Registre evidência sem inflar status.

## Gate de saída P0

P0 só está concluída quando:

- migration/schema/RLS estão consistentes e testados;
- ingestão e contrato v0.1 permanecem intactos;
- resolver shadow é idempotente e mensurável;
- ambiguidades não causam fusão;
- duplicações técnicas cobertas não inflam métricas;
- classificação progressiva grava histórico e respeita papéis;
- grupos não classificados continuam operando;
- confidence invalida queda em captura ruim;
- fallback/rollback foi testado;
- documentação separa local, remoto, campo e pendências;
- repositório está limpo e CI aprovada.

Ao finalizar, entregue resumo de mudanças, migrations, riscos, testes executados, links/evidências, estado do gate e pendências reais para P1. Não inicie P1 silenciosamente.

