# Android Sensor v0.3.0-connected

Adapter Android para o Moto G84, reconciliado a partir do bundle Git da
`v0.2.1`, do patch histórico da versão conectada e do APK observado em campo.

## Estado verificável

- `NormalizedEvent` está alinhado ao contrato `0.1.0`.
- `event_id` é persistido como chave primária antes do envio.
- eventos e batches possuem identidade determinística; o Core continua responsável por idempotência.
- token de ingestão é cifrado com Android Keystore; endpoint aceita somente HTTPS.
- o parser ativo é `MessagingStyleWhatsAppParser` (`0.3.0`).
- somente conversas explicitamente marcadas como grupo e mensagens temporizadas de
  `Notification.MessagingStyle` viram eventos.
- nenhum texto bruto de notificação é persistido pelo scaffold.

## Ainda não testado

- sync/build Gradle e geração do schema Room, pois este ambiente não contém
  Android SDK nem Gradle;
- instalação, autorização e ciclo de vida do listener no Moto G84;
- regressão física completa de agrupamento, truncamento e grupos silenciados;
- consumo de bateria, comportamento offline e recuperação após reinício.

O APK `0.3.0-connected` já enviou eventos ao ambiente remoto. A próxima prova
de campo deve comparar o build deste código com o comportamento desse APK sem
copiar conteúdo real para o repositório.
