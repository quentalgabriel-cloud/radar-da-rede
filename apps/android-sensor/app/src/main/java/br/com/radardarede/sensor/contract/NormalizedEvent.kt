package br.com.radardarede.sensor.contract

data class NormalizedEvent(
    val schemaVersion: String = SCHEMA_VERSION,
    val eventId: String,
    val networkId: String,
    val deviceId: String,
    val source: String = "android_notification",
    val sourceEventId: String? = null,
    val conversationId: String,
    val conversationLabel: String? = null,
    val occurredAt: String,
    val capturedAt: String,
    val messageType: String,
    val text: String? = null,
    val senderRef: String? = null,
    val replyToEventId: String? = null,
    val parserVersion: String,
    val metadata: Map<String, Any?> = emptyMap(),
) {
    companion object {
        const val SCHEMA_VERSION = "0.1.0"
    }
}
