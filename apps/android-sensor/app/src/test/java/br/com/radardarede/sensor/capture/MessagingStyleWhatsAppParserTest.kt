package br.com.radardarede.sensor.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MessagingStyleWhatsAppParserTest {
    @Test
    fun `parser requires explicit group evidence and MessagingStyle messages`() {
        val snapshot = NotificationSnapshot(
            sourceEventId = "probe-only",
            packageName = "com.whatsapp",
            postedAtEpochMillis = 1,
            capturedAtEpochMillis = 2,
            title = "Grupo",
            text = "Mensagem",
            subText = null,
            category = "msg",
            isGroupConversation = false,
        )

        assertTrue(MessagingStyleWhatsAppParser().parse(snapshot, "network", "device").isEmpty())
    }

    @Test
    fun `emits deterministic events only for explicit timed group messages`() {
        val parser = MessagingStyleWhatsAppParser()
        val capturedAt = 1_000_000L
        val snapshot = NotificationSnapshot(
            sourceEventId = "notification-key",
            packageName = "com.whatsapp",
            postedAtEpochMillis = capturedAt,
            capturedAtEpochMillis = capturedAt,
            title = "Grupo Teste",
            text = "resumo",
            subText = null,
            category = "msg",
            isGroupConversation = true,
            messages = listOf(
                NotificationMessage("Mensagem válida", capturedAt - 1_000L, "Pessoa A"),
                NotificationMessage("", capturedAt, "Pessoa B"),
                NotificationMessage("Futura", capturedAt + 301_000L, "Pessoa C"),
            ),
        )

        val first = parser.parse(snapshot, NETWORK_ID, DEVICE_ID)
        val replay = parser.parse(snapshot, NETWORK_ID, DEVICE_ID)

        assertEquals(1, first.size)
        assertEquals(first.single().eventId, replay.single().eventId)
        assertEquals("0.3.0", first.single().parserVersion)
        assertEquals("android_notification", first.single().source)
        assertEquals("Grupo Teste", first.single().conversationLabel)
        assertTrue(first.single().conversationId.startsWith("wa_"))
        assertTrue(first.single().senderRef?.startsWith("sender_") == true)
    }

    private companion object {
        const val NETWORK_ID = "11111111-1111-4111-8111-111111111111"
        const val DEVICE_ID = "22222222-2222-4222-8222-222222222222"
    }
}
