# P1 — Relatório de execução

Data: 2026-09-03

> **Adendo da auditoria pós-implementação (2026-09-03):** a implementação descrita abaixo permanece válida, mas a coleta shadow ainda não está operacional. A auditoria encontrou zero credenciais de processamento ativas, zero linhas em `group_metric_windows` e execução do workflow com o passo canônico pulado. Além disso, o gate analítico precisa das correções de âncora por execução, comparação de janelas e cobertura de captura descritas em [`PRODUCT-COMPLETION-ROADMAP.md`](PRODUCT-COMPLETION-ROADMAP.md). Portanto, a ativação está bloqueada até concluir [`P1.1-CONFIABILIDADE-E-ATIVACAO.md`](implementation-prompts/P1.1-CONFIABILIDADE-E-ATIVACAO.md).

## Resultado

A implementação de P1 foi concluída e instalada em modo shadow. O Control Center permanece desligado por rede até existirem duas janelas reais equivalentes com confiança suficiente. Essa espera é parte do gate de qualidade, não uma lacuna de código.

## Contrato e persistência

- `group_metric_windows` persiste métricas versionadas por execução e grupo.
- `persist_analysis_v2` mantém fatos, sinais, alertas e métricas na mesma transação.
- replay da mesma janela substitui as métricas da execução, sem duplicá-las.
- `persist_analysis` continua disponível como fallback quando a flag de métricas está desligada ou a RPC v2 ainda não existe.
- a associação evento/grupo usa os links devolvidos pelo resolvedor no mesmo processamento. Não há reconstrução posterior por label.
- `active_sender_count` foi excluído porque a semântica de `sender_ref` ainda não é estável entre fontes.

## Trend e Condition Engines

- tendência compara apenas janelas com duração equivalente, tolerância de 5%;
- percentual exige anterior >= 5 e volume combinado >= 10;
- estabilidade usa `abs(delta) < max(2, 20% do anterior)`;
- confidence low/unavailable em qualquer uma das duas janelas torna a tendência indisponível;
- condição é independente da direção: situação crítica, situação aberta, problema operacional ou normalidade;
- crescimento não é apresentado como resultado positivo nem cria alerta por si só.

## Read model e interface

- o contrato principal `schema_version: 0.1.0` foi preservado;
- `group_control_center.schema_version: 0.2.0` é uma extensão aditiva;
- `conversations`, classificação e histórico de P0 continuam disponíveis;
- Control Center implementa resumo, busca, filtros de condição, tendência, inatividade, classificação, origem e contexto;
- ordenações: atenção, queda, crescimento, atividade e recência;
- detalhe usa `dialog` lateral no desktop e tela cheia no mobile, com foco nativo, fechamento por teclado e reduced motion preservado;
- conteúdo de origem externa continua escapado antes de entrar no HTML.

## Evidência local

- check: aprovado em todos os 11 pacotes aplicáveis;
- testes: 83 aprovados, zero falhas;
- build: aprovado em todos os 11 pacotes aplicáveis;
- Supabase declarativo: 18 tabelas com RLS e migrations sincronizadas.

## Evidência remota

- migration `group_metric_windows` aplicada no projeto `pluruijhqnueayrlkthx`;
- teste transacional remoto executou a mesma entrada duas vezes, confirmou uma única linha métrica e removeu todos os registros de teste;
- `process-window` v5 ativa;
- `process-latest-window` v6 ativa;
- `radar-read-model` v12 ativa;
- `group_control_center_enabled=false` em todas as redes;
- zero linhas sintéticas ou backfill em `group_metric_windows`.

Não houve backfill porque os eventos históricos não carregam a ligação imutável `observation_key -> group_id` usada no processamento P1. Reconstruir essa identidade por label depois do fato poderia fundir grupos incorretamente.

## Rollout

1. Restaurar e validar a consolidação agendada; somente depois as próximas consolidações persistirão métricas shadow automaticamente.
2. Após duas janelas equivalentes, verificar volume, confidence e ausência de fusões ambíguas.
3. Habilitar `networks.group_control_center_enabled` somente para a rede validada.
4. Observar a primeira leitura ativa e comparar contagens agregadas com a janela processada.

## Rollback

- UI: definir `group_control_center_enabled=false` mantém imediatamente a tela v0.1.
- Processamento: definir `GROUP_METRICS_SHADOW_ENABLED=false` força `persist_analysis` v1.
- Edge Functions: versões anteriores conhecidas são process-window v3, process-latest-window v4 e radar-read-model v9.
- Banco: manter a tabela é seguro com a flag desligada; remoção física só deve ocorrer depois de reverter as funções que consultam o contrato v0.2.

## Recomendação de ativação

Ainda não habilitar o Control Center em produção. A ativação correta ocorre depois de duas janelas reais produzidas pelo código novo. Até lá, a coleta shadow e o fallback v0.1 preservam a operação atual.
