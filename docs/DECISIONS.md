# Registro de decisões

Os status usados são `ACEITA`, `PROVISÓRIA`, `HIPÓTESE` e `ESTACIONADA`.

## D-001 — Contrato source-agnostic

- **Status:** ACEITA
- **Data:** 2026-08-26
- **Decisão:** adapters convergem em `NormalizedEvent`; transporte e saúde usam contratos separados.
- **Evidência:** Android ainda não foi validado e WAHA permanece alternativa possível.
- **Consequência:** o core não importa modelos do Android, WAHA ou payloads de notificação.
- **Reabrir se:** fontes reais não puderem representar os eventos necessários sem perda material.

## D-002 — JSON Schema como contrato canônico

- **Status:** ACEITA
- **Data:** 2026-08-26
- **Decisão:** JSON Schema 2020-12 é a fonte portável; tipos de linguagem são derivados ou verificados contra ele.
- **Evidência:** o sistema terá TypeScript e Kotlin, além de possíveis adapters futuros.
- **Consequência:** validação não depende de uma biblioteca específica de uma linguagem.
- **Reabrir se:** geração e compatibilidade se tornarem mais complexas que o benefício observado.

## D-003 — At-least-once com identidade persistida no adapter

- **Status:** ACEITA
- **Data:** 2026-08-26
- **Decisão:** o adapter cria e persiste `event_id` antes do upload; retries reutilizam o mesmo ID. O servidor aplica idempotência.
- **Evidência:** dispositivos móveis ficam offline e podem repetir lotes.
- **Consequência:** duplicação de transporte não implica duplicação lógica.
- **Reabrir se:** surgir requisito demonstrável de semântica mais forte.

## D-004 — Supabase como backend inicial

- **Status:** PROVISÓRIA
- **Data:** 2026-08-26
- **Decisão:** Postgres, Edge Functions, Auth/RLS e agendamento do Supabase são o default inicial.
- **Evidência:** atendem ingestão, persistência, acesso e processamento do MVP com poucas peças.
- **Consequência:** migrations e funções ficam versionadas no repositório.
- **Reabrir se:** carga, latência, custo ou operação exigirem outro componente.

## D-005 — Android como adapter candidato

- **Status:** HIPÓTESE
- **Data:** 2026-08-26
- **Decisão atual:** construir foundations, mas não afirmar cobertura ou estabilidade.
- **Evidência ausente:** Moto G84 e chip ainda indisponíveis.
- **Consequência:** toda afirmação de captura real permanece NÃO TESTADA.
- **Reabrir se:** o probe reprovar cobertura, identidade ou estabilidade; nesse caso comparar WAHA.

## D-006 — Parser Android permanece vazio até existirem fixtures reais

- **Status:** ACEITA
- **Data:** 2026-08-26
- **Decisão:** a foundation usa `NoOpWhatsAppParser`; captura, outbox e transporte evoluem atrás de interfaces estáveis.
- **Evidência:** não há observação física do payload entregue pelo Moto G84.
- **Consequência:** o scaffold não fabrica regras a partir de exemplos imaginados nem persiste texto bruto de notificações.
- **Reabrir se:** o Sensor Probe produzir fixtures sanitizadas e uma matriz de cobertura reproduzível.

## D-007 — Foundation Android com poucas dependências

- **Status:** PROVISÓRIA
- **Data:** 2026-08-26
- **Decisão:** Views nativas, Room 2.8.4, WorkManager 2.11.2 e `HttpURLConnection`; AGP 9.2 usa Kotlin embutido.
- **Evidência:** o adapter precisa principalmente de persistência, retry e uma tela operacional mínima.
- **Consequência:** não entram Compose, DI framework ou cliente HTTP adicional antes de necessidade demonstrada.
- **Reabrir se:** testes reais mostrarem que a simplicidade prejudica manutenção, observabilidade ou confiabilidade.

## D-008 — Schema Supabase declarativo para projeto novo

- **Status:** PROVISÓRIA
- **Data:** 2026-08-26
- **Decisão:** manter o estado desejado em `supabase/schemas`; gerar e revisar migrations com o CLI após existir um projeto dedicado.
- **Evidência:** o Radar ainda não tem banco remoto próprio e o workflow declarativo é recomendado para projetos novos.
- **Consequência:** não criamos migration manual nem aplicamos DDL em projetos não relacionados.
- **Reabrir se:** o primeiro baseline remoto já possuir schema útil que precise ser importado.

## D-009 — Autenticação própria para source devices

- **Status:** PROVISÓRIA
- **Data:** 2026-08-26
- **Decisão:** tokens aleatórios de alta entropia, persistidos somente como SHA-256, autenticam Edge Functions com `verify_jwt=false` e validação no handler.
- **Evidência:** source devices não são usuários humanos e não precisam de sessão Supabase Auth.
- **Consequência:** `service_role` existe somente no runtime; web users continuam em Auth + RLS.
- **Reabrir se:** rotação, frota ou auditoria exigirem identidade de workload gerenciada.

## D-010 — Processamento determinístico por janela reproduzível

- **Status:** PROVISÓRIA
- **Data:** 2026-08-26
- **Decisão:** uma Edge Function executa a inteligência versionada sobre uma janela explícita e persiste o resultado em uma única RPC transacional.
- **Evidência:** os oito cenários já passam pela mesma implementação determinística e preservam referências aos eventos de origem.
- **Consequência:** replays da mesma entrada são serializados, recebem IDs determinísticos e não criam cópias lógicas de `facts`, `signals` ou `alerts`.
- **Reabrir se:** volume real exigir fila, particionamento, processamento incremental ou outro runtime.

## D-011 — Read model único entre laboratório e dados persistidos

- **Status:** ACEITA
- **Data:** 2026-08-26
- **Decisão:** dados sintéticos e persistidos chegam ao Radar Web no mesmo contrato de apresentação v0.1.0.
- **Evidência:** o builder persistido passa pelos mesmos campos que já alimentam as três telas do laboratório.
- **Consequência:** autenticação e seleção do provider ficam na borda; componentes visuais não conhecem tabelas Supabase nem detalhes do Source Adapter.
- **Reabrir se:** necessidades reais de paginação ou streaming exigirem contratos específicos por tela.

## D-012 — Credencial própria e escopada para processamento

- **Status:** ACEITA
- **Data:** 2026-08-26
- **Decisão:** o processador usa token aleatório com hash em `processing_credentials`, escopo de rede e revogação independente.
- **Evidência:** o conector não expõe gestão de secrets de runtime; a credencial em banco permitiu ensaio remoto sem distribuir `service_role`.
- **Consequência:** o segredo original existe apenas no cliente autorizado e pode ser rotacionado sem redeploy.
- **Reabrir se:** a operação adotar identidade de workload ou secret keys nomeadas com gestão automatizada.

## D-013 — Radar Web com providers reversíveis

- **Status:** ACEITA
- **Data:** 2026-08-26
- **Decisão:** laboratório e Supabase compartilham a mesma UI; o provider é escolhido em runtime e o modo real usa somente chave publicável + JWT do usuário.
- **Evidência:** o ambiente bloqueou a instalação do SDK, mas os endpoints oficiais de Auth e Functions cobrem o fluxo mínimo com Web APIs nativas.
- **Consequência:** não há chave privilegiada no browser; o cliente Auth mínimo fica isolado em um módulo substituível pelo SDK ou por SSR.
- **Reabrir se:** refresh de sessão, MFA, OAuth ou SSR justificarem adoção de `@supabase/ssr`/SDK.

## D-014 — Linguagem de sistema separada da linguagem de produto

- **Status:** ACEITA
- **Data:** 2026-08-26
- **Decisão:** contratos e tabelas preservam Event -> Fact -> Signal -> Alert; a UI apresenta atividade, assunto, movimento, situação, atenção e evidência.
- **Evidência:** a primeira versão expunha eventos, facts, signals, versões de parser e mensagens antes de explicar o que acontecia.
- **Consequência:** o read model prepara informações de produto, a home prioriza resumo e detalhes técnicos ficam em diagnóstico.
- **Reabrir se:** testes de compreensão com a coordenação mostrarem que outro vocabulário comunica melhor.

## D-015 — Snapshot canônico de 24 horas

- **Status:** PROVISÓRIA
- **Data:** 2026-08-31
- **Decisão:** cada consolidação recompõe integralmente uma janela móvel de 24 horas, ancorada no último horário operacional de Recife (08:00, 13:00 ou 18:00).
- **Evidência:** o read model persistido seleciona a execução concluída mais recente; processar somente o delta faria situações ainda relevantes desaparecerem da leitura.
- **Consequência:** atrasos e replays dentro da janela entram no snapshot seguinte; uma repetição no mesmo horário calcula a mesma janela e permanece idempotente.
- **Reabrir se:** dados reais mostrarem que 24 horas ocultam continuidade importante ou aumentam custo sem ganho operacional.

## D-016 — Agendamento único no backend do repositório

- **Status:** PROVISÓRIA
- **Data:** 2026-08-31
- **Decisão:** um único GitHub Actions workflow agenda 08:00, 13:00 e 18:00 em `America/Recife` e chama `process-window` com credencial de processamento guardada em GitHub Secrets.
- **Evidência:** o repositório já usa GitHub Actions; não há cron Supabase versionado ou comprovado. O workflow evita criar uma segunda função de processamento e mantém a credencial fora do navegador.
- **Consequência:** `RADAR_SUPABASE_URL`, `RADAR_NETWORK_ID` e `RADAR_PROCESSING_SECRET` precisam ser configurados no repositório antes da validação remota. O cron não pode ser chamado de ativo até uma execução observada.
- **Reabrir se:** a operação preferir e validar Supabase Cron com gestão equivalente de secrets, ou se a confiabilidade do GitHub Actions for insuficiente.

## D-017 — IA externa autorizada sob controle e avaliação

- **Status:** ACEITA
- **Data:** 2026-08-31
- **Decisão:** menções políticas, reação/sentimento agregado e segmentação por grupo/contexto estão autorizados. Antes da primeira chamada externa, o sistema deve registrar tarefa, modelo, tokens/custo, confiança e escopo; baseline determinística e fallback permanecem disponíveis.
- **Evidência:** a operação autorizou essas trilhas; isso não autoriza perfil individual, CRM ou inferência automática de intenção de voto.
- **Consequência:** P2 pode implementar módulos controlados e reversíveis sem gate jurídico externo, preservando permissões, rastreabilidade e avaliação de qualidade dentro do sistema.
- **Reabrir se:** custo, qualidade, operação ou controles internos forem insuficientes.

## D-018 — Identidade híbrida de grupos

- **Status:** ACEITA
- **Data:** 2026-08-31
- **Decisão:** `conversation_id` permanece evidência observada e `group_id` é resolvido no processamento por registry e aliases; eventos históricos não são reescritos.
- **Evidência:** Android deriva a conversa do rótulo e o read model recanoniza por nome, o que não sustenta rename ou nomes duplicados.
- **Consequência:** registry é aditivo, começa em shadow e ambiguidades não fundem grupos automaticamente.
- **Reabrir se:** todas as fontes passarem a fornecer identidade estável universal comprovada.

## D-019 — Contexto primário e classificação progressiva

- **Status:** ACEITA
- **Data:** 2026-08-31
- **Decisão:** grupos recebem um contexto primário opcional; `origin` começa como `legacy`, `current_operation` ou `unknown`. Ausência de classificação nunca bloqueia captura ou entrada.
- **Evidência:** a rede ativa combina território, liderança, projeto, tema, comunidade, evento e relações orgânicas.
- **Consequência:** território deixa de ser universal e contexto M:N permanece fora até necessidade observada.
- **Reabrir se:** a operação exigir múltiplos contextos simultâneos para decisões reais.

## D-020 — Classificação administrativa auditável sem aprovação dupla

- **Status:** ACEITA
- **Data:** 2026-08-31
- **Decisão:** alterações de metadata de grupo registram autor, instante, campo, valores anterior/novo e origem; operadores autorizados classificam sem fluxo obrigatório de dupla aprovação.
- **Evidência:** conhecimento de contexto está distribuído entre agentes e gerente de comunidade e precisa ser corrigível sem apagar histórico.
- **Consequência:** `group_classification_changes` registra somente metadata administrativa; mensagens e participantes não são duplicados.
- **Reabrir se:** erros operacionais demonstrarem necessidade de revisão adicional.

## D-021 — Credencial do dispositivo embutida no APK público: risco aceito

- **Status:** ACEITA
- **Data:** 2026-09-03
- **Responsável:** Gabriel Quental (dono do produto e do dispositivo)
- **Decisão:** manter `quentalgabriel-cloud/radar-sensor-probe` público, manter o APK `v0.3.0-connected` como asset de release e **não** rotacionar a credencial de ingestão agora.
- **Evidência:** o SHA-256 do segredo extraído do dex corresponde ao `token_hash` da única credencial ativa em `device_credentials`. O repositório é público, portanto o artefato é baixável por qualquer pessoa.
- **Alcance do risco:** permite injetar eventos e heartbeats escopados a este dispositivo. **Não** permite ler o Radar (read model exige JWT de usuário e RLS por rede), processar janelas (`processing_credentials` é separada) nem classificar grupos (exige operator/owner). É risco de integridade do sinal, não de confidencialidade dos dados já capturados.
- **Justificativa da aceitação:** o dispositivo está sob controle físico da operação, a rede é piloto e a rotação exige nova build e reinstalação, o que interromperia a captura em operação. O custo de mitigar agora supera o risco no estágio atual.
- **Consequência:** a integridade do sinal passa a depender de detecção, não de prevenção. Qualquer anomalia de volume ou origem deve ser tratada como possível injeção até prova em contrário.
- **Reabrir se:** a rede sair do piloto e passar a sustentar decisão operacional real; aparecerem eventos de origem ou volume não explicados pelo aparelho; o repositório precisar receber colaboradores externos; ou a próxima build do sensor for produzida por qualquer motivo — nesse caso, aproveitar para trocar o provisionamento para runtime e rotacionar junto.

## D-022 — Tolerância de cobertura calibrada em 45 minutos

- **Status:** ACEITA
- **Data:** 2026-09-04
- **Decisão:** `capture_coverage` passa à versão `@2` e a tolerância de ponte entre amostras sobe de 35 para 45 minutos.
- **Evidência:** primeira noite real de operação. Intervalo médio diurno de 3,6 min, máximo diurno de 16,7 min e máximo noturno de 41,4 min. Varrendo a tolerância sobre as amostras reais: 35 min deixa dois vãos sem ponte, 40 min deixa um, e 45 min ponteia todos. Cinquenta, sessenta e noventa minutos não acrescentam nada — 45 é o joelho da curva.
- **Causa dos vãos:** adiamento do `PeriodicWorkRequest` pelo Doze do Android, não perda de captura. O diagnóstico do aparelho mostra listener conectado sem interrupção desde 2026-08-29, e os eventos continuaram chegando durante os vãos.
- **Por que não é maquiar o gate:** `high` exige, além da cobertura, configuração de captura confirmada pelo adaptador. O sensor em operação não reporta `notification_access` nem `whatsapp_installed`, então o teto permanece `moderate` independentemente da tolerância. A calibração é incapaz de destravar `high` sozinha, e há teste fixando exatamente isso.
- **O que ela corrige de fato:** com 35 minutos, um período mais silencioso poderia derrubar a cobertura abaixo de 60% e produzir um `low` falso, suprimindo tendência legítima. A calibração elimina esse falso negativo sem afrouxar a detecção de parada real — uma parada de seis horas continua quebrando a cobertura, também com teste.
- **Consequência:** o resultado passa a expor `ceiling` e `ceiling_reason` quando o nível é limitado por falta de evidência de configuração, para que o teto não pareça defeito silencioso.
- **Caminho para `high`:** o sensor precisa reportar `notification_access`, `whatsapp_installed` e `network_type`. Trabalho no repositório `radar-sensor-probe`, não neste.
- **Reabrir se:** o comportamento medido do aparelho mudar, o sensor passar a reportar configuração, ou surgir um adaptador com cadência diferente.

## D-023 — Registry de grupos consolidado por reconstrução determinística, não por semelhança

- **Status:** ACEITA
- **Data:** 2026-09-04
- **Decisão:** aplicar `private.consolidate_group_registry` em produção para a rede piloto, fundindo os grupos criados pela identidade volátil de conversa em um grupo por rótulo canônico.
- **Evidência:** a derivação do id de conversa (`wa_` + sha256 do título bruto) é reproduzível: para os 206 aliases existentes, recalcular `sha256(conversation_label)` reproduz o `source_conversation_id` em todos os casos elegíveis. Isso não é backfill por semelhança de rótulo, que `AGENTS.md` proíbe — é reconstrução de uma função determinística, com prova por linha, e a função recusa qualquer alias sem essa prova.
- **Resultado aplicado:** 206 grupos ativos → 8. 198 fusões registradas em `group_merge_map` com evidência. Recusados: os 3 grupos de origem `fake` (sem título real para reprovar a derivação) e 1 grupo legítimo sem duplicata.
- **Salvaguarda estrutural:** a canonicalização não foi reimplementada em SQL. A função consome um mapa (`observed_label → canonical_label/key`) calculado com `canonicalConversationLabel`, a mesma usada para resolver grupo e para exibir. Duas implementações da mesma regra divergiriam com o tempo; divergir na consolidação fundiria conversas distintas. O check do CI (`check-supabase.mjs`) proíbe a regra em SQL.
- **Reprocessamento:** as 8 janelas canônicas distintas foram reprocessadas pelo caminho de produção (`process-window`), não somadas à mão. Todas retornaram `group_resolution.created:0` e `monitored_group_count == metric_row_count == 8`.
- **Efeito colateral encontrado e corrigido:** a consolidação arquiva grupo (`status='archived'`) em vez de excluir. O guardrail de `operational-health` contava `created_at` de qualquer grupo sem filtrar por `status`, o que reacenderia `registry_inflating` por 24h a cada consolidação futura contra um problema já corrigido. Corrigido no mesmo PR (#13) e confirmado contra produção: excedente caiu de 53 para 0.
- **Limite que esta decisão não resolve:** duas conversas realmente homônimas seriam fundidas por engano — identidade por título tem esse teto (D14). Só o `shortcutId`/`getLocusId()` da etapa 4, no sensor, elimina esse limite.
- **Reabrir se:** aparecer um alias cuja derivação não reproduza o hash e a consolidação precisar rodar de novo; ou a etapa 4 mudar a fonte de identidade, tornando esta função obsoleta para novos dados (ela continua válida como ferramenta de correção pontual).

## D-024 — Consolidação agendada por `pg_cron`, não mais por `schedule:` do GitHub Actions

- **Status:** ACEITA
- **Data:** 2026-09-05
- **Responsável:** Gabriel Quental, aval dado em resposta às 4 perguntas da seção 6 de `docs/P1.3-PLANO-PROXIMA-ETAPA.md` (PR #16).
- **Decisão:** o disparo de `process-window` nos seis slots diários passa a vir de dentro do Supabase (`pg_cron` + `pg_net`), não mais do `schedule:` de `.github/workflows/consolidate.yml`.
- **Evidência:** medido em 2026-09-05, o `schedule:` do GitHub Actions ficou **~19h sem disparar nenhuma execução, em dois workflows independentes**, com `workflow_dispatch` funcionando normalmente no mesmo período — não é falha de código, é entrega do agendador da plataforma para este repositório. `pg_cron`/`pg_net` já estavam disponíveis no projeto (`list_extensions`), só não instalados.
- **Como foi feito:** uma credencial de processamento **nova**, exclusiva desse caminho, gerada inteiramente dentro de uma transação SQL (`gen_random_bytes` → hash em `processing_credentials`, valor em claro em `vault.create_secret`) — o valor em texto puro nunca passou por fora do banco, nunca foi digitado nem visto por mim ou pelo Gabriel. A função `private.radar_cron_consolidate()` lê o segredo do Vault e chama `process-window` via `net.http_post`, nos mesmos seis horários UTC que o workflow já usava (`0 0,3,6,11,16,21 * * *`), preservando a política de comparação `same_slot_previous_day@1`.
- **O que isto não resolve (atualizado no mesmo dia):** a checagem de saúde também dependia só do `schedule:` do GitHub Actions e herdava o mesmo risco — confirmado: `operational-health.yml` ficou sem disparar desde 2026-09-04 ~19h44, mesmo depois da consolidação já ter migrado. `private.radar_cron_health_check()` (mesma migration de acompanhamento, `20260905163000_pg_cron_health_check.sql`) chama `operational-health` de dentro do próprio banco nos mesmos sete horários, em paralelo ao workflow — não em substituição, porque o workflow falha visivelmente (X vermelho) e um cron dentro do banco não tem esse sinal por natureza. **O que continua sem resolver:** nenhum dos dois caminhos avisa uma pessoa ativamente (e-mail, Slack); a leitura ainda depende de alguém consultar. `net._http_response`, mantido pelo próprio `pg_net`, é a trilha crua das checagens do lado do banco, com retenção curta.
- **Consequência:** `.github/workflows/consolidate.yml` perde o gatilho `schedule:` (mantém `workflow_dispatch` para disparo manual/depuração), para não ter duas fontes de agendamento confusas para o mesmo job — `process-window` já é idempotente por janela, então rodar as duas ao mesmo tempo não duplicaria dado, mas complicaria diagnóstico.
- **Reabrir se:** a causa raiz do `schedule:` do GitHub Actions for identificada e corrigida pela plataforma, tornando a duplicidade de agendador desnecessária; ou se a vigilância também precisar migrar para dentro do banco por continuar sendo silenciada.

## D-025 — Deploy de Edge Functions automático a cada push em `main`

- **Status:** ACEITA
- **Data:** 2026-09-05
- **Responsável:** Gabriel Quental, mesmo aval de D-024.
- **Decisão:** `.github/workflows/deploy-functions.yml` roda `pnpm verify` e implanta todas as Edge Functions a cada push em `main` que toque `supabase/functions/**`.
- **Evidência:** a etapa 1 (identidade de conversa) foi mesclada em `main` às 2026-09-04T03:35Z, corrigida, mas só foi efetivamente implantada às 18:18Z do mesmo dia — quase 15h em que o código correto existia no repositório e o comportamento antigo continuava em produção. Oito aliases voláteis nasceram nesse intervalo, confirmados por consulta direta ao banco.
- **Consequência:** o intervalo entre "mesclado" e "em produção" deixa de depender de alguém lembrar de rodar o comando manual. `pnpm verify` roda antes do deploy como última barreira.
- **Reabrir se:** um deploy automático causar uma regressão que o `verify` não pegou e que exigiria controle manual do momento exato do deploy (por exemplo, coordenar com uma migration que precisa rodar antes da função que a usa).

## D-026 — Diagnóstico de shortcutId/LocusId no sensor, sem mudar identidade ainda

- **Status:** ACEITA
- **Data:** 2026-09-05
- **Responsável:** Gabriel Quental, aval dado para "fazer o melhor possível" na etapa 4/6.3, incluindo criar nova build do sensor se necessário.
- **Decisão:** `radar-sensor-probe` v0.3.1-shortcut-diagnostic captura `shortcutId` (via `Ranking.getConversationShortcutInfo()`, API 31) e `LocusId` (via `Notification.getLocusId()`, API 29) de cada notificação do WhatsApp, e propaga os dois para `normalized_events.metadata` — campo livre, sem mudança de contrato. **`conversation_id` continua vindo só do hash do título; nenhuma identidade de grupo muda nesta build.**
- **Por que não a mudança completa:** a etapa 4 do plano (`docs/GROUP-IDENTITY-PLAN.md`) propunha usar `shortcutId` como identidade estável, mas isso dependia de uma pergunta não verificada — se o WhatsApp de fato preenche esses campos nas notificações que o sensor recebe. Reescrever a resolução de grupo sobre essa suposição, sem confirmar primeiro, arriscava trocar um problema conhecido (título instável) por um silencioso (campo sempre nulo, identidade nunca muda de verdade, ou pior, muda de um jeito não prancejado). Esta build só responde a pergunta, com dado real.
- **Achado técnico que também mudou o desenho:** verificado em código que `canonicalizeConversationEvent` (backend) já sobrescreve `conversation_id` com `label:<rótulo canônico>` antes de resolver, para todo evento com rótulo não vazio — então mesmo depois de confirmado que o WhatsApp preenche `shortcutId`, usar isso como identidade vai exigir mudança **também** no backend (`supabase/functions/_shared/canonical-conversations.js` e `group-resolution.js`), não só no sensor.
- **Rotação de credencial (gatilho de D-021 exercido):** a credencial de dispositivo foi rotacionada como parte desta build — nova credencial gerada localmente (`openssl rand -hex 32`), nunca vista em texto puro por este processo além do momento de geração, hash gravado em `device_credentials`, valor em claro só no secret `RADAR_DEVICE_SECRET` do repositório `radar-sensor-probe`. A credencial antiga (`token_hint 01e890c5`) **permanece ativa** até confirmação de que o aparelho está rodando a build nova — revogá-la cedo demais interromperia a captura em operação.
- **O que esta decisão não faz:** não move o provisionamento da credencial para runtime (a arquitetura continua embutindo o segredo no APK, D-021 permanece um risco aceito, não eliminado). Mover para provisionamento em runtime é um recorte maior, deliberadamente não incluído nesta build para manter a mudança pequena e testável.
- **Consequência:** depois de confirmado que o aparelho está com a build nova, revogar a credencial antiga
  (`update public.device_credentials set revoked_at = now() where id = '23589a49-acdf-4f28-959e-67ab896b5bb1'`)
  e, com alguns dias de dado real, consultar `normalized_events.metadata->>'shortcut_id'` e
  `->>'locus_id'` para responder A2/A3 do plano e decidir a próxima etapa com evidência, não suposição.
- **Reabrir se:** os campos vierem consistentemente nulos (resposta negativa a A2/A3 — nesse caso a etapa 4 precisa de outra estratégia, não mais `shortcutId`); ou vierem preenchidos, caso em que a etapa 4 "de verdade" (mudança de identidade coordenada sensor+backend) pode ser desenhada com confiança.
