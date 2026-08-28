package br.com.radardarede.sensor.contract

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
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
            put("batch_id", UUID.randomUUID().toString())
            put("network_id", networkId)
            put("device_id", deviceId)
            put("sent_at", Instant.now().toString())
            put("events", JSONArray(payloads.map(::JSONObject)))
        }.toString()
}
