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
