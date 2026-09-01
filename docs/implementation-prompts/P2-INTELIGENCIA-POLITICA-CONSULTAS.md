# PROMPT P2 — Inteligência política agregada, segmentação e consultas

## Papel e missão

Atue como Principal Product/Data Engineer, NLP/LLM Evaluation Engineer, Analytics Engineer, Security/Privacy Engineer, UX Researcher, Supabase Architect e QA/Red Team. Implemente capacidades políticas autorizadas de forma agregada, controlada, observável e reversível.

Menções políticas, reação/sentimento e segmentação estão desbloqueados. Não os trate como proibidos nem como autorização para perfil individual, CRM, intenção de voto ou disparo automático.

## Pré-condição obrigatória

Confirme que P0 e P1 passaram seus gates: identidade de grupos, classificação, confidence, métricas, read model v0.2, feature flag e controle de acesso. Se faltar base necessária, corrija ou documente bloqueio técnico específico. Não misture fundação incompleta com inferência política.

## Objetivo de P2

Entregar:

1. entidades monitoradas e aliases;
2. menções agregadas por grupo/contexto/janela;
3. reação/sentimento experimental com método e confiança;
4. segmentação analítica por grupos/contextos;
5. consultas estruturadas e linguagem natural controlada;
6. observabilidade de qualidade e custo de IA;
7. avaliação contra baseline determinística.

## Etapa 1 — Casos de uso e critérios

Formalize perguntas suportadas, por exemplo:

- quantos grupos/contextos citaram X no período;
- quais menções cresceram;
- quais assuntos acompanharam X;
- qual reação agregada foi observada e com qual confiança;
- onde houve material atrasado;
- quais grupos/contextos estão caindo com captura confiável.

Defina para cada pergunta: fonte, agregação, permissões, janela, resposta esperada, incerteza e ação permitida. Não prometa inferir opinião silenciosa, apoio ou voto.

## Etapa 2 — `tracked_entities`

Crie modelo mínimo e RLS:

- `id`, `network_id`;
- `name`;
- `aliases` ou tabela normalizada se unicidade/gestão justificar;
- `type`: actor|ally|project|topic|other;
- `enabled`;
- timestamps e autoria administrativa.

Permita manutenção por papel autorizado. Trate homônimos, aliases curtos e colisões. Matching determinístico deve registrar entidade, regra/alias, evento e versão. Não guardar perfil de remetente.

## Etapa 3 — Menções agregadas

Implemente baseline determinística antes de IA:

- normalização Unicode/case;
- boundaries e aliases;
- exceções/homônimos;
- contagem por evento, grupo, contexto e janela;
- source_event_ids/proveniência;
- comparação atual/anterior com confidence.

Crie `tracked_entity_spike` somente com volume mínimo e captura válida. Menção não significa reação favorável.

## Etapa 4 — Reação e sentimento

Defina taxonomia pequena e operacional, por exemplo `positive|negative|mixed|neutral|uncertain`, sujeita a validação. Compare no mínimo:

1. baseline determinística/lexical;
2. modelo candidato, se necessário.

Crie conjunto de avaliação revisado, sem usar dados sensíveis desnecessários. Meça precisão por classe, cobertura, uncertain rate e erros críticos como ironia, citação, conteúdo oficial compartilhado e homônimo.

Persistir/retornar de forma agregada:

- entidade/tema/contexto/janela;
- distribuição e amostra;
- método/modelo/versão;
- confidence;
- source_event_ids ou evidências autorizadas;
- status de revisão quando aplicável.

Nunca converter sentimento em intenção de voto, apoio individual ou score de liderança. Se o modelo não superar a baseline nos critérios definidos, mantenha baseline ou marque a análise como experimental, sem promovê-la a indicador principal.

## Etapa 5 — Segmentação analítica

Permita filtros e relatórios por grupos e contextos classificados, entidade, assunto, condition, trend e período. Registre usuário, timestamp, escopo e tipo de consulta quando a arquitetura suportar auditoria.

Segmentação serve para leitura/planejamento agregado. Não criar listas de indivíduos, persuasibilidade, recomendação personalizada por participante ou envio automático. Qualquer sugestão de conteúdo deve referir-se ao contexto/grupo observado e expor base/confiança.

## Etapa 6 — Consulta estruturada e linguagem natural

Crie catálogo de intents e parâmetros autorizados. Resolva com SQL/agregações/RPCs tipadas. Exemplos: top growing groups, material shortages, declining contexts, entity mentions.

Se linguagem natural for adicionada:

- LLM apenas traduz pergunta para intent/params permitidos ou resume resultado estruturado;
- validar rede, papel, período, limites e campos;
- não executar SQL livre gerado pelo modelo;
- mostrar interpretação e permitir correção;
- registrar erro/latência/custo;
- não adotar RAG/embeddings sem corpus e benefício comprovado.

## Etapa 7 — Observabilidade de IA e custos

Antes da primeira chamada externa, instrumente:

- network/request/run id sem expor segredo;
- task type;
- model/provider/version;
- messages/chars/input-output tokens;
- latency;
- cost estimate;
- cache/retry;
- status/error;
- avaliação/revisão quando disponível.

Implemente configuração de teto/limite e degradação segura para baseline determinística. Segredos ficam no runtime, nunca frontend, logs ou fixtures.

## Etapa 8 — Read model e UI

Adicione módulos sem sobrecarregar o Control Center:

- menções como movimento agregado;
- reação com badge experimental/confidence;
- filtros por entidade/contexto;
- relatório/consulta com período e escopo explícitos;
- evidências progressivas;
- estados sem dados, baixa confiança e indisponibilidade.

Não use cor isoladamente, não apresente percentuais sem denominador e não esconda incerteza.

## Testes obrigatórios

- `actor-mention-spike`;
- alias e homônimo;
- entidade desabilitada;
- conteúdo oficial compartilhado versus reação;
- positive/negative/mixed/neutral/uncertain;
- ironia/citação marcada incerta quando apropriado;
- baixa captura invalida tendência de menção/reação;
- segmentação por contexto sem participant profile;
- autorização por rede/papel;
- intent permitido, parâmetro inválido e tentativa de SQL livre;
- fallback sem IA;
- teto/custo/retry/error;
- provenance e escape de texto;
- regressão de P0/P1.

Mantenha dataset de avaliação versionado, sanitizado e com ground truth revisável. Não declarar qualidade por exemplos isolados.

## Rollout e rollback

Use feature flags separadas para tracked entities, reaction/sentiment, segmentation e natural-language query. Comece em shadow/experimental, compare baseline, monitore custo/erro e permita desligar cada módulo sem afetar ingestão, registry, métricas ou Control Center.

## Gate de saída P2

- entidades/aliases são administráveis e protegidos por RLS;
- menções determinísticas têm proveniência e métricas confiáveis;
- reação/sentimento expõe método, versão, confidence e incerteza;
- segmentação é de grupo/contexto, nunca de indivíduo;
- consultas usam intents/queries estruturadas, sem SQL livre do modelo;
- telemetria e teto de custo existem antes da IA;
- baseline/fallback funciona;
- avaliação demonstra qualidade suficiente ou módulo permanece explicitamente experimental;
- flags/rollback foram testados;
- documentação e CI estão atualizadas.

Finalize com relatório de qualidade por tarefa, custos observados/estimados, limitações, testes, rollout, rollback e status individual de cada módulo. Não marque P2 inteira como concluída se apenas menções estiverem prontas.

