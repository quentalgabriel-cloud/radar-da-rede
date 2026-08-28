package br.com.radardarede.sensor.capture

import org.junit.Assert.assertTrue
import org.junit.Test

class NoOpWhatsAppParserTest {
    @Test
    fun `unvalidated parser never invents events`() {
        val snapshot = NotificationSnapshot(
            sourceEventId = "probe-only",
            packageName = "com.whatsapp",
            postedAtEpochMillis = 1,
            capturedAtEpochMillis = 2,
            title = "Grupo",
            text = "Mensagem",
            subText = null,
            category = "msg",
            isGroupConversation = true,
        )

        assertTrue(NoOpWhatsAppParser().parse(snapshot, "network", "device").isEmpty())
    }
}
