# Relatório de fechamento P0

## Resultado

P0 encerrada tecnicamente em 2026-09-03. A operação permanece ativa e grupos não classificados continuam processáveis.

## Evidência remota

- O Group Registry contém 124 grupos e 124 aliases, todos automáticos e ainda não classificados no instante da verificação.
- O banco preserva 1.064 eventos normalizados e 175 lotes.
- Ensaio temporário confirmou: rename substantivo vira ambiguidade; grupos não são fundidos; revisão humana reassocia o alias; motivo muda para `operator_confirmed`; repetição de classificação não cria histórico; dados de teste são removidos integralmente.
- Resumo agregado informa grupos, não classificados, classificações parciais/confirmadas, aliases automáticos/confirmados, ambiguidades, rejeições e colisões, sem texto de mensagens.
- `process-window` v3, `process-latest-window` v4 e `radar-read-model` v9 estão ativos.

## Evidência do Moto G84

Fonte: export de diagnóstico gerado em 2026-08-31 19:37:39 UTC.

- app `0.3.0-connected`, parser e contrato `0.3.0`;
- Motorola Moto G84 5G, Android 15;
- 232 snapshots acumulados; export inclui os 80 snapshots recentes, com 208 itens de MessagingStyle;
- 396 eventos enviados, fila pendente zero e zero falhas de upload registradas;
- listener conectado, heartbeat recente, dois testes iniciados e ao menos um teste concluído;
- quatro recuperações de snapshot e 24 remoções de notificação observadas.

O export não contém todos os campos do heartbeat normalizado (`notification_access`, `whatsapp_installed` e `network_type`). Por isso, esses campos ausentes agora produzem confidence `unavailable`, nunca uma inferência saudável.

## Gate P0

| Critério | Estado | Evidência |
|---|---|---|
| Schema, migration e RLS | aprovado | migrations remotas e checks declarativos |
| Contrato/eventos imutáveis | aprovado | contrato v0.1 sem `group_id`; totais preservados |
| Resolver idempotente | aprovado | replay e ensaio remoto |
| Ambiguidade sem fusão | aprovado | ensaio remoto de rename |
| Classificação auditável e por papel | aprovado | RPCs, no-op e `can_manage` remotos |
| Grupo não classificado opera | aprovado | 124 grupos permanecem no fluxo |
| Confidence fraca invalida tendência | aprovado | regras sincronizadas e testes |
| Fallback | aprovado | chave `GROUP_RESOLUTION_SHADOW_ENABLED=false` e fallback por RPC indisponível |
| Interface administrativa | aprovado | deployment de produção `dpl_DjjtTiQCQVwdFMFta4QVt8LrL9Rc`, READY |
| Campo | parcial documentado | captura/upload comprovados; Community e condições especiais seguem como observação operacional |

CI geral `33789762633` e Android Sensor `33789764537` concluíram com sucesso no commit `dbb68c4`.

## Limitações conhecidas que não mudam o contrato P0

- Não existe usuário `viewer` na rede remota para ensaio humano; RLS e ausência de controles são cobertas estruturalmente, enquanto o backend valida toda mutation.
- Community, announcement group, grupos silenciados, reboot e restrições de bateria não foram todos reproduzidos de forma dirigida. O sistema não depende de uma tabela de Community e continua registrando identidade observada.
- Os 124 grupos precisam de classificação progressiva pela operação; ausência de classificação não é falha nem bloqueio.
