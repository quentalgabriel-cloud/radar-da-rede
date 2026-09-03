# Android — evidência de campo

## Diagnóstico de 31 de agosto de 2026

Arquivo analisado localmente:

`radar-sensor-diagnostico-1788205059574.json`

SHA-256:

`EABDEDB8F1467827F93F33531FDAD7684409F1BEEB79402846DFAA6212DE5D21`

O arquivo não é versionado porque preserva estrutura derivada de notificações reais. Somente métricas técnicas não textuais são registradas aqui.

### Estado observado

- diagnóstico gerado em 2026-08-31 16:37:39 -03:00;
- listener conectado desde 2026-08-29 11:30:46 -03:00;
- 232 snapshots locais;
- 396 eventos enviados;
- outbox pendente igual a zero;
- zero falhas de upload registradas;
- último heartbeat remoto aprovado oito segundos antes da exportação;
- última notificação observada, snapshot salvo e upload concluído em 2026-08-31 14:36:11 -03:00;
- 31 incidentes técnicos: 24 remoções de notificação, quatro recuperações de snapshot ativo, dois testes iniciados e uma conexão do listener;
- teste local iniciado em 2026-08-30 21:03:53 -03:00 e aprovado em 2026-08-31 10:03:25 -03:00;
- exportação contém os 80 snapshots mais recentes, 40 deles com mensagens e 208 mensagens estruturadas no total.

### Conclusões

- A cadeia local de captura, persistência, parsing, envio e heartbeat funcionou durante o período observado.
- A ausência de pendências e falhas, junto aos 396 eventos remotos, sustenta a operação parcial relatada.
- O diagnóstico confirmou que heartbeat remoto e estado do listener fazem parte do comportamento real da versão conectada; esses campos devem permanecer no port Kotlin.
- A exportação é adequada para análise estrutural, mas não substitui os testes direcionados de grupos silenciados, reboot, economia de bateria e perda de rede.

### Limites

- `parser_status=RAW` nos snapshots descreve a origem preservada do diagnóstico e não significa que nenhum evento foi emitido.
- As 80 amostras exportadas cobrem aproximadamente 24 horas, não todo o período desde a instalação.
- Não foram inspecionados nem registrados textos, nomes de grupos ou identificadores reais.

## Verificação remota de 2026-09-03

Consulta direta a `public.adapter_health` no projeto `pluruijhqnueayrlkthx`:

- os heartbeats chegam e são recentes;
- `adapter_version` é `0.3.0-connected` e `parser_version` é `0.3.0`;
- `listener_connected`, `notification_access`, `whatsapp_installed`,
  `network_type`, `last_whatsapp_notification_at` e `last_parsed_event_at`
  estão **nulos**;
- há 15 transições registradas em `capture_health_transitions`, todas derivadas
  de `status` e `outbox_pending` (7 `queue_backlog`, 7 `recovered`,
  1 `monitoring_started`).

O RPC `ingest_health_heartbeat` persiste todos esses campos e o schema de
contrato os aceita, então a ausência vem do que o aparelho envia.

`PayloadCodec.heartbeat` no repositório envia `listener_connected` desde o
commit `8bf0cd0` (2026-08-31 16:45 -03:00). Como o campo chega nulo, o APK em
operação é anterior a esse commit — coerente com `docs/DEPLOYMENTS.md`, que já
registrava a instalação da build de heartbeat como pendente.

`notification_access`, `whatsapp_installed` e `network_type` **não são enviados
por nenhuma versão do repositório**. Isso é lacuna de produto, não de instalação.

### Consequência analítica

A regra de confiança anterior exigia esses quatro campos e devolvia
`unavailable` sempre que qualquer um faltasse. Como `computeMetricTrend` suprime
a tendência quando a confiança é `unavailable`, o Control Center anterior nunca
mostraria tendência com dados reais, qualquer que fosse o volume capturado.

A regra de cobertura da P1.1 degrada em vez de zerar: sem os campos de
configuração o nível fica limitado a `moderate`, com razão
`configuration_not_reported`. Para chegar a `high` são necessários continuidade
observada e um APK que reporte a configuração da captura.

### Artefatos locais

Ambos fora do repositório, em `outputs/`:

| Artefato | SHA-256 |
|---|---|
| `radar-sensor-v0.3.0-connected-debug/app-debug.apk` | `9861b1104b818f4f6658c0b423a494fdd411d884c1292763730565185b2cef24` |
| `radar-sensor-v0.3.0-connected-heartbeat/app-debug.apk` | `882f4143bcf4b7ade3806a6ed0c8eccdd9fc8b1fb9a1260d62d476eab392037a` |

Nenhum dos dois foi confirmado como o instalado no aparelho. Registrar
`versionCode`, hash e data de instalação é parte da matriz de campo pendente.

## Diagnóstico de 3 de setembro de 2026

Arquivo analisado localmente, não versionado:
`radar-sensor-diagnostico-1788470700762.json`, gerado em 2026-09-03 21:25:00 UTC.

SHA-256:
`c59e7fab14e9d22502752de083bd5da3b44fe3d8bb365297acb6f91f1b467351`

O próprio arquivo declara: conteúdo textual e identificadores foram removidos ou
pseudonimizados. Somente métricas técnicas são registradas aqui. Nenhum rótulo de
conversa, texto ou identificador real foi inspecionado ou copiado.

### Aparelho e build

| Campo | Valor |
|---|---|
| aparelho | motorola moto g84 5G |
| Android | 15 (SDK 35), patch de segurança 2026-08-01 |
| pacote | `br.com.radardarede.sensor` |
| versão declarada | `0.3.0-connected`, parser `0.3.0`, probe contract `0.3.0` |

### Estado observado

- listener conectado, sem nenhuma desconexão registrada desde
  **2026-08-29 14:30:46 UTC** — mais de cinco dias de continuidade;
- `provisioned: true`, `outbox_pending: 0`, `upload_failures: 0`;
- último heartbeat local em 21:24:39 UTC, dois minutos antes da exportação;
- 500 snapshots locais, dos quais 80 exportados;
- 50 incidentes técnicos: 49 remoções de notificação do WhatsApp e um teste de
  captura iniciado, entre 2026-08-31 16:55 e 2026-09-03 10:51 UTC;
- teste de captura iniciado em 2026-09-02 18:45:25 e aprovado às 19:11:49 UTC;
- os 80 snapshots exportados cobrem de 2026-09-02 23:29 a 2026-09-03 20:00 UTC,
  em 29 conversas distintas, 42 deles com mensagens e 215 mensagens estruturadas.

### Conferência contra o banco

| Métrica | Aparelho | Banco | Conferência |
|---|---:|---:|---|
| eventos enviados | 1.080 | 1.080 (`android_notification`) | **confere exatamente** |
| falhas de upload | 0 | — | sem perda silenciosa |
| fila pendente | 0 | — | nada retido |

Não há perda nem duplicação entre o que o aparelho diz ter enviado e o que o
banco persistiu. Essa é a evidência mais forte de confiabilidade da captura até
agora, e vale para uma semana de operação real.

### Calibração da tolerância de cobertura

As 28 amostras de `capture_health_samples` acumuladas até 21:28 UTC têm intervalo
mínimo de 0,3 min, médio de 3,6 min e máximo de **16,7 min**. Nenhum intervalo
passou dos 35 minutos adotados como tolerância em `capture_coverage@1`. A
tolerância está calibrada com folga contra dado real, e não por suposição.

O aparelho reporta com frequência bem maior que os 15 minutos do
`PeriodicWorkRequest`, provavelmente porque também envia heartbeat junto dos
uploads.

## Divergência crítica: o APK em operação não vem deste repositório

O diagnóstico permitiu comparar, campo a campo, o que o aparelho envia com o que
o código do repositório produziria. Eles **não são o mesmo programa**.

| Evidência | Repositório | APK em operação |
|---|---|---|
| `counters` do heartbeat | `notifications_observed`, `events_emitted` | `events_uploaded`, `snapshots_local`, `upload_failures` |
| `listener_connected` | enviado sempre | nunca chega |
| `last_whatsapp_notification_at` | enviado junto de `last_event_captured_at` | só `last_event_captured_at` chega |
| exportação de diagnóstico | não existe no código | existe e foi usada |

Os campos do diagnóstico — `privacy_note`, `snapshot_count`, `probe_contract`,
`incidents`, `parser_status`, `detail_ref`, `security_patch` — **não aparecem em
nenhum dos 19 arquivos Kotlin do repositório**.

A hipótese anterior, registrada em 2026-09-03, de que o aparelho rodava uma build
anterior ao commit `8bf0cd0`, está **descartada**: esse commit foi o que
introduziu o heartbeat, e o aparelho envia heartbeat. A explicação correta é
outra: o APK em campo tem funcionalidade que o repositório não contém, e o
repositório tem comportamento que o APK não apresenta. Os dois divergiram.

Isso é coerente com os nomes dos commits `ebdc56b` e `8bf0cd0`, ambos começando
com “Restore”: o código Android foi reconstruído parcialmente, e a reconstrução
não reproduz a build que está em operação.

### Consequências

1. **A matriz de campo perde sentido enquanto isso durar.** Testar o aparelho
   hoje é testar código que não está versionado; testar uma build do repositório
   é testar algo que nunca operou.
2. **Instalar a build do repositório seria uma regressão.** Perderia a exportação
   de diagnóstico, mudaria os contadores do heartbeat e alteraria a cadeia de
   captura que está funcionando bem há uma semana. Não deve ser feito só para
   obter `listener_connected`.
3. **A confiança de captura fica limitada a `moderate`**, porque
   `notification_access`, `whatsapp_installed` e `network_type` não chegam — e
   nenhuma das duas versões, nem a do repositório nem a de campo, os envia.
4. **O SHA-256 registrado em `docs/DEPLOYMENTS.md` não identifica o que está
   rodando.** Nenhum dos dois APKs locais foi confirmado como o instalado.

### Próximo passo recomendado

Antes de qualquer matriz de campo ou troca de APK, recuperar a procedência do
código Android em operação. Em ordem de preferência:

1. localizar a fonte que gerou a build instalada e versioná-la;
2. se ela não existir mais, extrair `versionCode`, `versionName` e hash do APK
   instalado no aparelho e registrar a build como artefato opaco, tratando o
   repositório como o alvo de reconstrução;
3. só então decidir se a próxima build acrescenta `notification_access`,
   `whatsapp_installed` e `network_type`, preservando a exportação de
   diagnóstico e os contadores atuais.

Trocar o APK é mudança na captura em operação e exige janela combinada,
verificação de heartbeat depois da troca e rollback preparado.

## Procedência recuperada em 2026-09-03 — D18 resolvido

A divergência registrada acima tem explicação completa. O código Android em
operação **não se perdeu**: ele vive em outro repositório.

| Item | Valor |
|---|---|
| repositório | `quentalgabriel-cloud/radar-sensor-probe` (público) |
| release | `v0.3.0-connected`, publicada em 2026-08-29 06:04 UTC |
| branch da onda conectada | `codex/v0.3-connected-wave-1` |
| artefato | `radar-sensor-probe-v0.3.0-connected.apk`, 48.976 bytes |
| SHA-256 | `6ab9761080869484e02066dd902e816ff161e416c9950e728a6c3d9a3dcff128` |

O APK baixado da release confere byte a byte com a cópia local, e com o hash
publicado ao lado dele na própria release.

A análise do dex confirma que é a build em operação: contém
`radar-sensor-diagnostico-`, `privacy_note`, `probe_contract`, `snapshot_count`,
`incidents`, `parser_status`, `detail_ref`, `security_patch` e os contadores
`events_uploaded`, `snapshots_local` e `upload_failures` — exatamente o que o
banco recebe. Também contém `listener_connected` e
`last_whatsapp_notification_at`, e **não** contém `notification_access`,
`whatsapp_installed` nem `network_type`.

### Linhagem

É um projeto Java independente, não o módulo Kotlin deste monorepo:

- `2026-08-27` — commit inicial do probe;
- `2026-08-29 02:36` — release `v0.2.1-probe`, versionCode 3, só captura local e
  exportação de diagnóstico;
- `2026-08-29 06:04` — release `v0.3.0-connected`, que acrescenta ingestão,
  heartbeat e sincronização.

O `Radar-Sensor-v0.2.1-Publicacao.zip` guardado localmente contém um git bundle
com o histórico até `v0.2.1-test-evidence`, o que permitiu identificar a origem
antes mesmo de encontrar o repositório.

Classes da branch conectada: `BackoffPolicy`, `CaptureTestEvaluator`,
`DiagnosticExporter`, `EventIdentity`, `HealthStore`, `IngestClient`,
`MainActivity`, `NotificationSnapshotExtractor`, `ProbeDatabase`,
`RadarNotificationListenerService`, `SensorConfig`, `SnapshotEventParser`,
`SyncCoordinator`.

### Correção do registro anterior

O módulo `apps/android-sensor` deste monorepo **nunca produziu o APK em
operação**. São dois programas diferentes com o mesmo `applicationId`. O
`versionName` `0.3.0-connected` coincide por convenção, não por origem comum, e
foi isso que gerou a confusão anterior. O SHA-256 registrado em
`docs/DEPLOYMENTS.md` para o artefato Android é de uma build Gradle deste
monorepo, de 3 MB, que nunca operou — e não do APK de 48 KB que está no aparelho.

### Consequência para a matriz de campo

A matriz de campo volta a ser possível, mas o alvo é o repositório
`radar-sensor-probe`, não `apps/android-sensor`. Antes de executá-la é preciso
decidir o que fazer com o módulo Kotlin deste monorepo: hoje ele é código morto
que aparenta ser o sensor de produção.

## Exposição da credencial do dispositivo

`SensorConfig.java` lê o segredo de `BuildConfig.RADAR_DEVICE_SECRET`, injetado
no build. **A fonte está limpa**: o segredo não aparece no código.

O APK publicado, porém, carrega o valor em claro no dex, como qualquer segredo
embutido em aplicativo Android. Foi verificado que o SHA-256 do valor extraído do
APK é exatamente o `token_hash` da **única credencial de dispositivo ativa** em
`public.device_credentials`.

Como o repositório `radar-sensor-probe` é público, o artefato da release é
baixável por qualquer pessoa. Ou seja: a credencial que o sensor usa hoje em
produção pode ser extraída por qualquer um que baixe o APK.

### Alcance real

| Capacidade | Com a credencial do dispositivo |
|---|---|
| injetar eventos e heartbeats na rede | **sim**, escopado a este dispositivo |
| ler o Radar | não — o read model exige JWT de usuário e RLS por rede |
| processar janelas | não — usa `processing_credentials`, credencial separada |
| alterar classificação ou grupos | não — exige papel operator/owner |

O risco é de **integridade**, não de confidencialidade: alguém poderia poluir o
sinal operacional com eventos fabricados. Nada do que já foi capturado vaza.

### Decisão pendente

Rotacionar a credencial interrompe a captura até o aparelho receber uma build
nova, porque o segredo é de build. As opções não são exclusivas:

1. tornar `radar-sensor-probe` privado, ou remover o APK dos assets da release —
   reduz a exposição futura, não alcança cópias já baixadas;
2. rotacionar a credencial, gerar build nova e reinstalar no Moto G84, em janela
   combinada, com verificação de heartbeat depois da troca;
3. mudar o provisionamento para runtime, de modo que o segredo deixe de existir
   dentro do artefato — é a correção estrutural, e remove o problema de vez.

Enquanto a decisão não for tomada, vale monitorar `ingest_batches` e
`normalized_events` por origem e volume incomum. Nenhuma ação foi executada nesta
sessão: revogar a credencial pararia a captura em operação.
