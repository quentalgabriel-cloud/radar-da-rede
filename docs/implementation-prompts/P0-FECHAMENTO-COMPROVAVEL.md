# PROMPT DEFINITIVO — Fechamento comprovável da P0

## Missão

Feche a P0 do Radar da Rede sobre a operação ativa, sem interromper ingestão, sensor, processamento ou Radar Web. Trate arquivos de diagnóstico apenas como evidência. Não declare como testado o que não foi observado.

## Estado de partida confirmado

- Group Registry e aliases estão ativos no Supabase.
- O backfill reconheceu 101 observações; o replay criou zero duplicações.
- Classificação, histórico e revisão de alias passaram em ensaio remoto temporário.
- As Edge Functions shadow estão publicadas e o contrato `NormalizedEvent` v0.1 permanece intacto.
- O diagnóstico de 2026-08-31 contém 232 snapshots, outbox zero, listener conectado, quatro recuperações e 24 remoções de notificação. Campos ausentes não podem ser interpretados como saudáveis.

## Entregas obrigatórias

1. Tornar a resolução explicável: persistir motivo, distinguir automático, confirmado, ambíguo e rejeitado, e fornecer resumo sem conteúdo de mensagens.
2. Cobrir rename, mesmo label com identidades diferentes, ambiguidade, rejeição persistente e no-op de classificação.
3. Disponibilizar classificação administrativa mínima para operator/owner, com leitura para membros e enforcement definitivo no backend.
4. Mostrar histórico e permitir confirmar/rejeitar aliases, sem aprovação dupla e sem bloquear grupo não classificado.
5. Completar testes de deduplicação reproduzíveis sem descartar mensagens legítimas iguais.
6. Provar que confidence baixa/indisponível invalida tendência e representar campos ausentes como indisponíveis.
7. Criar chave de desligamento do shadow e testar fallback sem Group Registry.
8. Executar migrations, testes locais, ensaio remoto sanitizado, deploy, CI e documentação.

## Restrições

- Não alterar eventos normalizados nem exigir `group_id` do Android.
- Não fundir por label isolado.
- Não expor texto de mensagens em relatórios administrativos.
- Não criar CRM, perfil individual ou gate jurídico externo.
- Não exigir classificação para o grupo continuar operando.
- Não iniciar P1 ou P2.

## Gate de saída

P0 só fecha quando schema e migrations convergem; resolução é idempotente e explicável; ambiguidades não fundem grupos; classificação e histórico funcionam com papéis reais; fallback está testado; confidence fraca invalida tendências; evidências local, remota e de campo estão separadas; `pnpm verify`, CI e workspace estão limpos.

Se alguma prova física continuar impossível, registre uma limitação conhecida com impacto e mitigação. Não use essa limitação para inflar nem impedir artificialmente o fechamento técnico da P0.
