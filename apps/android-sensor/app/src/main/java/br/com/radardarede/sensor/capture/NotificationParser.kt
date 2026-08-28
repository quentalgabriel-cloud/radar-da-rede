package br.com.radardarede.sensor.capture

import br.com.radardarede.sensor.contract.NormalizedEvent

interface NotificationParser {
    val version: String
    fun parse(snapshot: NotificationSnapshot, networkId: String, deviceId: String): List<NormalizedEvent>
}

/**
 * Deliberately emits nothing. Real WhatsApp parsing starts only after probe
 * fixtures establish what the Moto G84 actually exposes.
 */
class NoOpWhatsAppParser : NotificationParser {
    override val version = "0.0.0-unvalidated"

    override fun parse(
        snapshot: NotificationSnapshot,
        networkId: String,
        deviceId: String,
    ): List<NormalizedEvent> = emptyList()
}
