package br.com.radardarede.sensor.contract

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.nio.charset.StandardCharsets
import java.util.UUID

object PayloadCodec {
    fun event(event: NormalizedEvent): JSONObject = JSONObject().apply {
        put("schema_version", event.schemaVersion)
        put("event_id", event.eventId)
        put("network_id", event.networkId)
        put("device_id", event.deviceId)
        put("source", event.source)
        event.sourceEventId?.let { put("source_event_id", it) }
        put("conversation_id", event.conversationId)
        event.conversationLabel?.let { put("conversation_label", it) }
        put("occurred_at", event.occurredAt)
        put("captured_at", event.capturedAt)
        put("message_type", event.messageType)
        put("text", event.text ?: JSONObject.NULL)
        event.senderRef?.let { put("sender_ref", it) }
        event.replyToEventId?.let { put("reply_to_event_id", it) }
        put("parser_version", event.parserVersion)
        put("metadata", JSONObject(event.metadata))
    }

    fun batch(networkId: String, deviceId: String, payloads: List<String>): String =
        JSONObject().apply {
            put("schema_version", NormalizedEvent.SCHEMA_VERSION)
            put("batch_id", batchId(payloads))
            put("network_id", networkId)
            put("device_id", deviceId)
            put("sent_at", Instant.now().toString())
            put("events", JSONArray(payloads.map(::JSONObject)))
        }.toString()

    fun heartbeat(
        networkId: String,
        deviceId: String,
        observedAt: Long,
        outboxPending: Int,
        oldestPendingAt: Long?,
        lastNotificationAt: Long?,
        lastParsedEventAt: Long?,
        lastUploadSucceededAt: Long?,
        observedCount: Long,
        emittedCount: Long,
        listenerConnected: Boolean,
    ): String = JSONObject().apply {
        put("schema_version", NormalizedEvent.SCHEMA_VERSION)
        put("heartbeat_id", UUID.randomUUID().toString())
        put("network_id", networkId)
        put("device_id", deviceId)
        put("source", "android_notification")
        put("observed_at", Instant.ofEpochMilli(observedAt).toString())
        put("adapter_version", "0.3.0-connected")
        put("parser_version", "0.3.0")
        put("status", if (outboxPending > 0) "degraded" else "healthy")
        put("outbox_pending", outboxPending)
        put("listener_connected", listenerConnected)
        oldestPendingAt?.let { put("oldest_pending_at", Instant.ofEpochMilli(it).toString()) }
        lastNotificationAt?.let {
            put("last_event_captured_at", Instant.ofEpochMilli(it).toString())
            put("last_whatsapp_notification_at", Instant.ofEpochMilli(it).toString())
        }
        lastParsedEventAt?.let { put("last_parsed_event_at", Instant.ofEpochMilli(it).toString()) }
        lastUploadSucceededAt?.let {
            put("last_upload_succeeded_at", Instant.ofEpochMilli(it).toString())
        }
        put("counters", JSONObject(mapOf(
            "notifications_observed" to observedCount,
            "events_emitted" to emittedCount,
        )))
    }.toString()

    private fun batchId(payloads: List<String>): String {
        val eventIds = payloads
            .map { JSONObject(it).getString("event_id") }
            .sorted()
        return UUID.nameUUIDFromBytes(
            ("radar-batch-v1:" + eventIds.joinToString("|"))
                .toByteArray(StandardCharsets.UTF_8),
        ).toString()
    }
}
