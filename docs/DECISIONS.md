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
