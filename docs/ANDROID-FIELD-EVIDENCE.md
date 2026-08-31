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
