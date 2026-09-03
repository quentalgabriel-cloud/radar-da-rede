# Handoff para continuidade por qualquer LLM

Atualizado em: 2026-09-03  
Branch: `main`  
Base auditada: commit `5b70646`  
Projeto Supabase: `pluruijhqnueayrlkthx`  
Produção web: `https://radar-da-rede.vercel.app`

## Estado executivo

P0 foi implantada. P1 foi implementada e instalada em shadow, mas **não está operacionalmente aprovada**. O Control Center permanece desligado. A próxima fase é **P1.1**, não P2.

O plano vigente é `docs/PRODUCT-COMPLETION-ROADMAP.md`. O prompt obrigatório da próxima onda é `docs/implementation-prompts/P1.1-CONFIABILIDADE-E-ATIVACAO.md`.

## Evidência remota mais recente

| Item | Valor observado em 2026-09-03 |
|---|---:|
| eventos | 1.064 |
| batches | 175 |
| grupos | 124 |
| grupos confirmados | 0 |
| aliases ambíguos | 0 |
| métricas P1 | 0 |
| redes com Control Center ativo | 0 |
| credenciais de processamento ativas | 0 |
| último heartbeat | 2026-09-03 18:45:02 UTC |
| último evento | 2026-09-03 16:35:36 UTC |
| último processamento | 2026-09-02 20:16:52 UTC |

Funções observadas após P1: `process-window` v5, `process-latest-window` v6 e `radar-read-model` v12. Confirme tudo novamente antes de alterar.

## Bloqueios que não podem ser ignorados

1. O workflow `Consolidate Radar` fica verde sem secrets, mas pula o processamento.
2. Sem credencial ativa, nenhuma janela/métrica P1 real é produzida.
3. Grupo sem evento na execução atual pode receber sua métrica antiga como “atual”.
4. Janelas móveis adjacentes de 24h se sobrepõem.
5. Snapshot recente de saúde pode superestimar a cobertura de toda a janela.
6. GET do read model pode disparar processamento/escrita.
7. Synthetic e live duplicam a implementação do Control Center.
8. Faltam E2E real e matriz dirigida de campo no Moto G84.

## Próxima ação exata

Execute integralmente `docs/implementation-prompts/P1.1-CONFIABILIDADE-E-ATIVACAO.md`.

Comece pela restauração operacional:

1. auditar novamente o estado local e remoto;
2. criar/rotacionar credencial de processamento pelo mecanismo existente;
3. configurar `RADAR_SUPABASE_URL`, `RADAR_NETWORK_ID` e `RADAR_PROCESSING_SECRET` no GitHub;
4. fazer o workflow falhar quando não estiver configurado;
5. executar uma janela manual real e replay idempotente;
6. confirmar `processing_runs` e `group_metric_windows`;
7. só então implementar as correções analíticas P1.1.

Secrets não estão no repositório. Sem acesso autorizado ao GitHub/Supabase, implemente e teste o que for local, registre a validação remota pendente e não simule sucesso.

## Gate para ativar o Control Center

- scheduler executa e falha de forma visível;
- existem duas janelas reais comparáveis;
- inatividade/zero estão ancorados à execução atual;
- confidence mede cobertura do período;
- read model é somente leitura;
- paridade, integração, E2E e campo foram aprovados;
- vocabulário/horizonte foram validados com a coordenação;
- rollback foi testado.

Até lá, `group_control_center_enabled=false`.

## Decisões que não devem ser reabertas sem evidência nova

- operação ativa substituiu o antigo gate pré-operação;
- não existe aprovação jurídica externa como gate;
- análise política, sentimento e segmentação agregada são permitidos;
- perfil individual, intenção de voto, CRM e disparo automático estão fora do escopo;
- eventos históricos não recebem backfill de grupo por label;
- P2 será dividida em P2A determinística e P2B experimental;
- linguagem natural nunca executa SQL livre.

## Qualidade conhecida

Na conclusão de P1, 83 testes, checks/builds dos 11 pacotes e teste transacional remoto passaram. A migration P1 foi aplicada, não houve backfill sintético e `pnpm audit --prod` não reportou advisories em 2026-09-03. Isso prova implementação, não os gates P1.1.

## Rollback conhecido

- UI: `group_control_center_enabled=false`;
- métricas: `GROUP_METRICS_SHADOW_ENABLED=false` retorna à RPC v1;
- versões anteriores registradas: process-window v3, process-latest-window v4, read-model v9;
- não remover a tabela de métricas antes de reverter consumidores.

Confirme o inventário no ambiente antes de qualquer rollback.

## Documentos essenciais

- `AGENTS.md`
- `docs/PRODUCT-COMPLETION-ROADMAP.md`
- `docs/implementation-prompts/P1.1-CONFIABILIDADE-E-ATIVACAO.md`
- `docs/P0-CLOSURE-REPORT.md`
- `docs/P1-EXECUTION-REPORT.md`
- `docs/DEEP_IMPLEMENTATION_IMPACT_REVIEW.md`
- `docs/PROJECT.md`
- `docs/SUPABASE.md`
- `docs/DATA_GOVERNANCE.md`

## Obrigação de encerramento

Antes de parar, atualize este arquivo com data/commit, mudanças, migrations/functions/APK/flags, testes realmente executados, métricas atuais, bloqueios, próxima ação única e rollback. Não deixe decisões relevantes apenas em chat.
