# Android Sensor foundation

Adapter Android candidato para o Moto G84. A fundação já separa captura,
parser, outbox Room e upload WorkManager, mas **não afirma que notificações do
WhatsApp possam ser convertidas corretamente**.

## Estado verificável

- `NormalizedEvent` está alinhado ao contrato `0.1.0`.
- `event_id` é persistido como chave primária antes do envio.
- o transporte é at-least-once e o Core continua responsável por idempotência.
- token de ingestão é cifrado com Android Keystore; endpoint aceita somente HTTPS.
- o parser ativo é `NoOpWhatsAppParser` (`0.0.0-unvalidated`).
- nenhum texto bruto de notificação é persistido pelo scaffold.

## Ainda não testado

- sync/build Gradle e geração do schema Room, pois este ambiente não contém
  Android SDK nem Gradle;
- instalação, autorização e ciclo de vida do listener no Moto G84;
- formato, agrupamento, truncamento e identidade das notificações reais;
- consumo de bateria, comportamento offline e recuperação após reinício.

Quando o aparelho estiver disponível, a primeira mudança será um Sensor Probe
consentido para produzir fixtures sanitizadas. Só depois o `NoOpWhatsAppParser`
será substituído por um parser versionado.
