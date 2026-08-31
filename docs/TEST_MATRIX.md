# Matriz de testes

| Área | Caso | Estado | Evidência |
|---|---|---|---|
| Contrato | NormalizedEvent válido | TESTADO | `packages/contracts/test/contracts.test.js` |
| Contrato | Evento com versão desconhecida é rejeitado | TESTADO | `packages/contracts/test/contracts.test.js` |
| Contrato | Campos fora da versão são rejeitados | TESTADO | `packages/contracts/test/contracts.test.js` |
| Transporte | Batch inconsistente com device/network é rejeitado | TESTADO | `packages/contracts/test/contracts.test.js` |
| Fake Sensor | Reenvia o mesmo batch, envia heartbeat e dispara processamento opcional | TESTADO | `apps/fake-sensor/test/fake-sensor.test.js` |
| Core | Credencial de dispositivo inválida é rejeitada | TESTADO | `packages/core/test/core.test.js` |
| Core | Replay do mesmo batch preserva uma cópia | TESTADO | `packages/core/test/core.test.js` |
| Core | Heartbeat obsoleto não substitui estado atual | TESTADO | `packages/core/test/core.test.js` |
| Ponta a ponta sintético | Fake Sensor -> Core -> eventos + health | TESTADO | `apps/core-simulator/test/e2e.test.js` |
| Cenário | `normal-day` corresponde ao ground truth declarado | TESTADO | `packages/testkit/test/scenarios.test.js` |
| Cenário | `material-shortage` corresponde ao ground truth declarado | TESTADO | `packages/testkit/test/scenarios.test.js` |
| Cenários | Os oito cenários recomendados são válidos e reproduzíveis | TESTADO | `packages/testkit/test/scenarios.test.js` |
| Cenário | `offline-recovery` preserva diferença entre ocorrência e captura | TESTADO | `packages/testkit/test/scenarios.test.js` |
| Volume | Batch de 120 eventos aceita replay sem duplicação | TESTADO | `apps/core-simulator/test/e2e.test.js` |
| Inteligência | `normal-day` não cria signal/alert indevido | TESTADO | `packages/intelligence/test/intelligence.test.js` |
| Inteligência | `material-shortage` produz recorrência e bloqueio | TESTADO | `packages/intelligence/test/intelligence.test.js` |
| Inteligência | Todo derivado mantém origem nos eventos | TESTADO | `packages/intelligence/test/intelligence.test.js` |
| Inteligência | Ground truth dos oito cenários é atendido | TESTADO | `packages/intelligence/test/intelligence.test.js` |
| Radar Web | Shell e view model são servidos | TESTADO | `apps/radar-web/test/web.test.js` |
| Radar Web | Overview renderiza alerta e métricas | TESTADO | Verificação no Vercel em 2026-08-26 |
| Radar Web | Navegação Radar -> Explorar -> Saúde | TESTADO | Verificação no Vercel em 2026-08-26 |
| Radar Web | Filtro reduz cinco eventos para Bairro Novo | TESTADO | Verificação no Vercel em 2026-08-26 |
| Radar Web | Seletor alterna oito cenários com um único view model | TESTADO | Suite web + Vercel em 2026-08-26 |
| Radar Web | Alto volume renderiza 120 eventos, 8 grupos e zero alertas | TESTADO | Verificação no Vercel em 2026-08-26 |
| Radar Web | Mudança de agenda exibe alerta médio e evidência | TESTADO | Verificação no Vercel em 2026-08-26 |
| Android foundation | Contrato, separação parser/outbox/transporte e ausência de service role | TESTADO | `apps/android-sensor/scripts/check-foundation.test.mjs` |
| Android build | Sync Gradle, compilação e schema Room | NÃO TESTADO | Ambiente atual sem Android SDK/Gradle |
| Supabase foundation | Todas as tabelas expostas têm RLS e contratos Edge estão sincronizados | TESTADO ESTATICAMENTE | `packages/supabase-core/scripts/check-supabase.mjs` |
| Supabase ingestão | Reenvio do mesmo batch não duplica eventos | TESTADO REMOTAMENTE | Ensaio idempotente e 73 batches registrados |
| Supabase health | Heartbeat atualiza último contato | TESTADO REMOTAMENTE | Heartbeats `fake` e `android_notification` registrados |
| Android | NotificationListener recebe grupos normais | NÃO TESTADO | Aguarda Moto G84 |
| Android | Grupos silenciados | NÃO TESTADO | Aguarda Moto G84 |
| Android | Foreground e multi-device | NÃO TESTADO | Aguarda Moto G84 |
| Android | Burst de vários grupos | NÃO TESTADO | Aguarda Moto G84 |
| Android | Reboot, bateria e background | NÃO TESTADO | Aguarda Moto G84 |
| Produto | Coordenação percebe sinais com menos esforço | NÃO TESTADO | Aguarda piloto |
| Radar Web | Refresh manual e automático compartilham estado central | TESTADO LOCALMENTE | `apps/radar-web/test/refresh-controller.test.js` |
| Radar Web | Auto refresh pausa oculto e evita chamadas paralelas | TESTADO LOCALMENTE | `apps/radar-web/test/refresh-controller.test.js` |
| Consolidação | Horários 08:00, 13:00 e 18:00 usam `America/Recife` | TESTADO LOCALMENTE | `packages/supabase-core/test/consolidation-schedule.test.js` |
| Consolidação | Retry no mesmo slot produz janela canônica idêntica | TESTADO LOCALMENTE | `packages/supabase-core/test/consolidation-schedule.test.js` |
| Consolidação | Workflow chama `process-window` sem segredo no frontend | TESTADO ESTATICAMENTE | `packages/supabase-core/scripts/check-supabase.mjs` |
| Consolidação | Três execuções diárias ocorrem no ambiente remoto | NÃO TESTADO | Aguarda configuração de GitHub Secrets e observação do workflow |
| Inteligência | IA externa respeita governança e supera baseline | NÃO IMPLEMENTADO | Gate de governança aberto; baseline determinística preservada |
