# Plano — identidade estável de conversa

Escrito em 2026-09-04, depois de a causa raiz ser provada. Substitui a suspeita
registrada em `docs/GROUP-IDENTITY-FINDING.md`, que apontava para "o sensor não
tem identidade estável". A realidade é melhor e o conserto é menor.

## Diagnóstico provado

O sensor **já deriva a identidade do título**, como se pretendia:

```java
String conversation = firstText(extras, "conversation_title", "title", "title_big");
String conversationId = "wa_" + EventIdentity.sha256(conversation).substring(0, 32);
```

O que quebra é o título do WhatsApp carregar a contagem acumulada:

| Título recebido | Id gerado |
|---|---|
| `‎CAMPANHA … (258 mensagens)` | `wa_ce298e99ae1…` |
| `‎CAMPANHA … (259 mensagens)` | `wa_9fb99009bbc…` |
| `‎CAMPANHA … (260 mensagens)` | `wa_368de6f897f…` |

Cada notificação muda a contagem, muda o hash, cria um grupo.

O título também traz `U+200E` invisível no início, que entra no hash.

**Verificação da derivação:** para os 204 pares distintos
`(conversation_id, conversation_label)` do banco, recalcular
`'wa_' || substr(sha256(conversation_label), 1, 32)` reproduz **204 de 204**.
Nenhum caso divergente.

Isso importa para o `AGENTS.md`: consolidar esses grupos **não é** backfill por
semelhança de rótulo. É reconstrução determinística de uma derivação verificável,
com prova por linha.

## Princípio da solução

A normalização certa **já existe e já é confiada** neste repositório:
`canonicalConversationLabel`, em `supabase/functions/_shared/canonical-conversations.js`,
faz NFKC, remove `U+200B`–`U+200F` e `U+FEFF`, remove o sufixo `(N mensagens)` e
apara. O read model a aplica para exibir. O caminho de resolução de grupo não.

Não há regra nova a inventar. Há uma regra existente a aplicar onde falta.

## Sequência

A ordem é por risco, e cada etapa vale por si.

### 1. Estancar — canonicalizar antes de resolver o grupo

Em `process-window` e `process-latest-window`, passar os eventos por
`canonicalizeConversationEvent` **antes** de `resolveGroupObservationsShadow` e
de `buildEventGroupLinks`. Hoje só a análise é canonicalizada, e apenas no
caminho manual.

- não exige tocar no aparelho;
- aditivo e reversível por redeploy;
- efeito: a partir da próxima janela, cada conversa passa a resolver para **um**
  grupo estável, com `source_conversation_id` na forma `label:<rótulo canônico>`;
- os 199 grupos antigos param de crescer e ficam inertes.

Teste: uma janela com o mesmo grupo em cinco notificações de contagens
diferentes precisa produzir uma linha de métrica, não cinco.

### 2. Proteger — guardrail na vigilância

Acrescentar ao `operational-health` a razão entre grupos ativos e rótulos
canônicos distintos. Se voltar a inflar, o job cai antes de alguém perceber pela
tela. É a mesma classe de defeito que passou meses invisível; não pode depender
de inspeção manual.

### 3. Consolidar o registry existente

Só depois de 1 e 2 estarem em produção e o crescimento ter parado.

Desenho:

1. gravar uma tabela de mapeamento `grupo_duplicado → grupo_sobrevivente`,
   derivada do rótulo canônico e da fonte, com o hash recalculado como prova;
2. eleger como sobrevivente o grupo de `first_seen_at` mais antigo, preservando
   a classificação já feita, se houver;
3. repontar `group_aliases` para o sobrevivente, **mantendo** cada
   `source_conversation_id` original: a trilha de evidência de qual título gerou
   qual alias não pode ser apagada;
4. **não** somar `group_metric_windows` à mão. Apagar as linhas das execuções
   afetadas e **reprocessar as janelas** pelo caminho de produção, que é
   idempotente. Recalcular é mais seguro que remendar, e usa o mesmo código que
   será auditado depois;
5. arquivar os duplicados em vez de excluir, até a conferência passar.

Reversível: o mapeamento permite desfazer, e nenhum evento é tocado.

### 4. Corrigir na origem — o sensor

No repositório `quentalgabriel-cloud/radar-sensor-probe`, aplicar a mesma
canonicalização antes do hash, para que a identidade nasça estável:

```java
String conversation = canonicalTitle(firstText(extras, "conversation_title", "title", "title_big"));
String conversationId = "wa_" + EventIdentity.sha256(conversation).substring(0, 32);
```

`canonicalTitle` precisa ser a mesma regra do backend, com teste que compare as
duas implementações contra os mesmos casos.

Aproveitar a build para:

- reportar `notification_access`, `whatsapp_installed` e `network_type`, sem os
  quais a confiança de captura nunca passa de `moderate` (D-022);
- avaliar `Notification.getShortcutId()` como identidade primária. O aparelho é
  Android 15, e apps de conversa publicam atalho por conversa. Seria identidade
  **independente do título**, resistente a renomeação — a única que resolve D14
  de verdade. O sensor hoje não lê essa API;
- rotacionar a credencial e mover o provisionamento para runtime, encerrando
  D-021 sem custo adicional de operação.

Trocar o APK é mudança na captura em operação: exige janela combinada,
verificação de heartbeat depois da troca e rollback preparado.

### 5. Só então, ligar o Control Center

Com identidade estável, a tela passa a mostrar a rede real. Antes disso, não.

## Riscos e o que os contém

| Risco | Contenção |
|---|---|
| A canonicalização cria um grupo novo por conversa, somando aos antigos | Esperado e transitório; a etapa 3 consolida. O guardrail avisa se não parar |
| Identidade passa a depender do título, e renomear cria grupo novo | Limitação declarada, já prevista no `AGENTS.md`. A etapa 4 com `shortcutId` é o que a elimina |
| Consolidação apaga histórico | Nada de evento é tocado; aliases preservam o id de origem; duplicados são arquivados, não excluídos |
| Reprocessar janelas altera números que a equipe já viu | Os números atuais estão errados por inflação; a correção precisa aparecer. Registrar no handoff quando acontecer |
| A build nova do sensor regride a captura | Janela combinada, heartbeat conferido depois, APK anterior guardado com hash |

## Como saber que funcionou

- uma janela produz uma linha de métrica por conversa real, não por notificação;
- grupos ativos ≈ rótulos canônicos distintos, e o guardrail fica quieto;
- o Control Center mostra unidades que a coordenação reconhece como grupos;
- renomear um grupo no WhatsApp, depois da etapa 4 com `shortcutId`, **não**
  cria grupo novo.

## O que não fazer

- não agrupar por semelhança de rótulo: aqui a derivação é exata e verificável,
  e é isso que autoriza a consolidação;
- não excluir grupos antes da conferência;
- não somar métricas à mão quando reprocessar é possível;
- não ligar o Control Center antes da etapa 3.

---

## Etapa 1 — concluída e validada remotamente em 2026-09-04

Implantada em `process-window` e `process-latest-window` a partir de `main`
(`8d9a4d3`), pela CLI, sem tocar no aparelho.

Execução de verificação `74656da8-ba9b-4370-b691-0dbe1981a66b`, janela
`2026-09-03T16:00Z → 2026-09-04T16:00Z`:

| Critério | Esperado | Observado |
|---|---|---|
| conversas reais na janela | — | 2 |
| grupos criados | um por conversa | **2** |
| aliases canônicos (`label:…`) | 2 | **2** |
| grupos com atividade na janela | 2 | **2** |
| aliases voláteis (`wa_…`) remanescentes | inertes | 201 |

Segunda execução logo em seguida: **nenhum grupo novo**, total estável em 206,
mesmo `processing_run_id` devolvido. O crescimento parou.

Antes desta mudança, uma janela com essa mesma conversa criava um grupo por
notificação. Os 201 aliases voláteis permanecem intactos e sem uso, aguardando a
etapa 3. Nenhum evento foi alterado: 1.475 antes e depois.

**Estado das etapas:** 1 concluída. 2 e 3 pendentes. O Control Center continua
desligado.

## Achado paralelo — o cron do GitHub não entrega os slots

Medido em 2026-09-04. Entre 00:00 e 17:58 UTC, cinco slots eram esperados
(00, 03, 06, 11 e 16). Ocorreram **duas** execuções agendadas, às 07:46 e 14:50,
ambas com atraso de horas.

A correção de seis slots está no código e no `main`, mas o GitHub Actions não a
honra: atrasa e pula agendamentos. É comportamento conhecido de cron em
repositório público, e significa que a frescura real para a equipe é pior que a
projetada.

A vigilância operacional **não pega isso**: ela mede "consolidação atrasada"
contra seis horas, e um sub-fornecimento crônico fica abaixo desse limite. É a
mesma classe de falha silenciosa que ela existe para eliminar.

Duas coisas a decidir, ambas fora do escopo da etapa 1:

1. acrescentar à vigilância a razão entre slots entregues e esperados no dia;
2. avaliar `pg_cron` dentro do Supabase como agendador, que não depende da fila
   do GitHub. É mudança de infraestrutura e precisa de decisão explícita, com
   atenção a onde a credencial de processamento passaria a viver.

---

## Etapa 4 — evidência de campo obtida em 2026-09-07

O diagnóstico pedido ao Victor foi exportado no Moto G84 depois da instalação
da release `v0.3.1-shortcut-diagnostic`. O SHA-256 do APK analisado,
`890a0869bed0a3713bbf3fdab4727b8bbc92e9b16c8393a804082fd5d9bf1c91`, é
idêntico ao digest do asset oficial; o workflow da release concluiu com sucesso
depois de executar `apksigner verify`.

### Resposta às perguntas do diagnóstico

- `shortcutId`: **presente e útil**. Os quatro snapshots exportados contêm três
  valores; duas representações de notificação com rótulos distintos compartilham
  o mesmo shortcut.
- `LocusId`: **ausente** nos quatro snapshots e em todos os 556 eventos 0.3.1
  observados no Supabase. Não é candidato para a identidade nesta amostra.
- estabilidade em volume: um único shortcut aparece em 553 eventos ligados a
  82 títulos/ids brutos. A variação textual muda; o shortcut permanece.

Isso encerra a descoberta, mas não autoriza uma substituição direta no live. O
backend ainda canonicaliza todo evento para `label:<rótulo canônico>` antes de
resolver o registry. A mudança correta precisa ser coordenada: hash do shortcut
na origem ou no limite confiável, fallback explícito, reconciliação dos aliases,
reprocessamento das janelas e rollback.

### Achados adicionais que precisam entrar na próxima build

1. O exportador afirma que identificadores foram pseudonimizados, mas deixa
   `shortcut_id` e `locus_id` intactos. Não compartilhar novos relatórios sem
   redigir esses campos.
2. O heartbeat continua sem `notification_access`, `listener_connected`,
   `whatsapp_installed` e `network_type`, mantendo o teto de confiança.
3. `HealthStore.remoteStatus` permanece em `offline_recovery` depois da primeira
   falha recuperada. O Supabase recebeu 134 amostras nesse estado em 48 h; a UI
   pode dizer “captura restabelecida” por tempo indefinido.
4. Nas 48 h auditadas houve 22 intervalos acima de 35 min entre heartbeats e um
   intervalo de 11.184 s (3h06). Instalação e recuperação funcionam, mas reboot,
   Doze, bateria, offline controlado e grupos silenciados ainda exigem soak
   dirigido.

**Estado:** diagnóstico do shortcut `VALIDADO EM CAMPO`; migração de identidade,
correções de saúde/privacidade e matriz física completa `PENDENTES`. O piloto
pode continuar ligado com cobertura baixa explícita; expansão continua vedada.
