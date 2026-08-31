package br.com.radardarede.sensor.capture

import br.com.radardarede.sensor.contract.NormalizedEvent
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID

interface NotificationParser {
    val version: String
    fun parse(snapshot: NotificationSnapshot, networkId: String, deviceId: String): List<NormalizedEvent>
}

/**
 * Deliberately emits nothing. Real WhatsApp parsing starts only after probe
 * fixtures establish what the Moto G84 actually exposes.
 */
class MessagingStyleWhatsAppParser : NotificationParser {
    override val version = "0.3.0"

    override fun parse(
        snapshot: NotificationSnapshot,
        networkId: String,
        deviceId: String,
    ): List<NormalizedEvent> {
        if (snapshot.isGroupConversation != true || snapshot.messages.isEmpty()) return emptyList()
        val conversation = sequenceOf(snapshot.title, snapshot.subText)
            .filterNotNull()
            .map(String::trim)
            .firstOrNull(String::isNotEmpty)
            ?: return emptyList()
        val conversationId = "wa_${sha256(conversation).take(32)}"
        return snapshot.messages.mapIndexedNotNull { index, message ->
            val text = message.text.trim()
            val occurredAt = message.occurredAtEpochMillis
            if (!isEligibleMessage(text, occurredAt, snapshot.capturedAtEpochMillis)) {
                return@mapIndexedNotNull null
            }
            val senderRef = message.sender?.trim()?.takeIf(String::isNotEmpty)
                ?.let { "sender_${sha256(it).take(24)}" }
            val fingerprint = listOf(
                conversationId,
                occurredAt.toString(),
                senderRef.orEmpty(),
                sha256(text),
            ).joinToString("|")
            NormalizedEvent(
                eventId = nameUuid("radar-event-v1:$fingerprint"),
                networkId = networkId,
                deviceId = deviceId,
                sourceEventId = "android_notification:${sha256(fingerprint)}",
                conversationId = conversationId,
                conversationLabel = conversation,
                occurredAt = Instant.ofEpochMilli(occurredAt).toString(),
                capturedAt = Instant.ofEpochMilli(snapshot.capturedAtEpochMillis).toString(),
                messageType = "text",
                text = text,
                senderRef = senderRef,
                parserVersion = version,
                metadata = mapOf(
                    "notification_key" to snapshot.sourceEventId,
                    "message_index" to index,
                    "evidence" to "notification_messaging_style",
                ),
            )
        }
    }

    internal fun isEligibleMessage(text: String, occurredAt: Long, capturedAt: Long): Boolean =
        text.isNotBlank() && occurredAt > 0 && capturedAt > 0 &&
            occurredAt <= capturedAt + FUTURE_TOLERANCE_MS

    private fun nameUuid(value: String): String =
        UUID.nameUUIDFromBytes(value.toByteArray(StandardCharsets.UTF_8)).toString()

    private fun sha256(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

    private companion object {
        const val FUTURE_TOLERANCE_MS = 5L * 60L * 1000L
    }
}
