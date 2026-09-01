# Prompts de implementação por fase

Este diretório transforma o roadmap do Radar da Rede em três ondas executáveis. Cada prompt deve ser usado em uma tarefa separada e sempre contra o estado mais recente da `main`.

| Ordem | Prompt | Resultado esperado | Gate de saída |
|---|---|---|---|
| 1 | [`P0-ESTABILIZACAO-OPERACAO-ATIVA.md`](P0-ESTABILIZACAO-OPERACAO-ATIVA.md) | identidade de grupos, aliases, classificação auditável, deduplicação e confidence em shadow | ingestão intacta, registry mensurável, testes e rollback |
| 2 | [`P1-METRICAS-CONTROL-CENTER.md`](P1-METRICAS-CONTROL-CENTER.md) | métricas por janela, tendência/condição/confiança, read model v0.2 e Control Center | paridade lab/live, feature flag e UI validada |
| 3 | [`P2-INTELIGENCIA-POLITICA-CONSULTAS.md`](P2-INTELIGENCIA-POLITICA-CONSULTAS.md) | entidades monitoradas, reação/sentimento agregado, segmentação e consultas estruturadas | avaliação, custo, confiança, controle de acesso e ausência de perfil individual |

## Regra de execução

Não executar as três fases em uma única alteração. O agente deve primeiro auditar o gate da fase anterior. Se o gate estiver incompleto, concluir ou documentar objetivamente a pendência antes de avançar. Isso não interrompe a operação ativa: captura, ingestão e read model estável continuam funcionando durante toda a evolução.

Cada prompt exige que o agente diferencie:

- **IMPLEMENTADO:** código presente;
- **TESTADO LOCALMENTE:** suíte reproduzível passou;
- **VALIDADO REMOTAMENTE:** ambiente remoto observado;
- **VALIDADO EM CAMPO:** evidência física real;
- **PENDENTE:** trabalho ou evidência ainda ausente.

