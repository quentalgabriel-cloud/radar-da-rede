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
